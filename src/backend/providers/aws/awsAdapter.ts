import { AssumeRoleCommand, GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { GetAccountSummaryCommand, IAMClient } from '@aws-sdk/client-iam';

export function isAwsServerCredentialsConfigured(): boolean {
  return Boolean(
    process.env.AWS_ACCESS_KEY_ID?.trim() && process.env.AWS_SECRET_ACCESS_KEY?.trim()
  );
}

export function validateAwsAccountId(accountId: string): boolean {
  return /^\d{12}$/.test(accountId.trim());
}

export function validateAwsRoleArn(roleArn: string): boolean {
  return /^arn:(aws|aws-us-gov|aws-cn):iam::\d{12}:role\/[\w+=,.@/-]+$/.test(roleArn.trim());
}

export function validateAwsRegion(region: string): boolean {
  return /^[a-z]{2}(-[a-z]+)+-\d+$/.test(region.trim());
}

export function validateIdentityCenterPortalUrl(portalUrl: string): boolean {
  try {
    const parsed = new URL(portalUrl.trim());
    return parsed.protocol === 'https:' && parsed.hostname.endsWith('.awsapps.com');
  } catch {
    return false;
  }
}

export async function verifyAwsIamRole(params: {
  roleArn: string;
  externalId?: string;
  region: string;
}): Promise<{
  assumedAccountId: string;
  assumedArn: string;
  assumedUserId: string;
  expiration: string | null;
  iamSummaryAvailable: boolean;
  iamRolesCount?: number;
}> {
  if (!isAwsServerCredentialsConfigured()) {
    throw new Error(
      'AWS_CREDENTIALS_NOT_CONFIGURED: Server AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set in environment secrets to execute STS AssumeRole.'
    );
  }

  const sts = new STSClient({ region: params.region });
  const assumeResp = await sts.send(
    new AssumeRoleCommand({
      RoleArn: params.roleArn.trim(),
      RoleSessionName: `AccountBridge-${Date.now()}`,
      ExternalId: params.externalId?.trim() || undefined,
      DurationSeconds: 900,
    })
  );

  const creds = assumeResp.Credentials;
  if (!creds?.AccessKeyId || !creds.SecretAccessKey || !creds.SessionToken) {
    throw new Error('AWS STS AssumeRole did not return temporary session credentials.');
  }

  const tempCreds = {
    accessKeyId: creds.AccessKeyId,
    secretAccessKey: creds.SecretAccessKey,
    sessionToken: creds.SessionToken,
  };

  const targetSts = new STSClient({ region: params.region, credentials: tempCreds });
  const caller = await targetSts.send(new GetCallerIdentityCommand({}));

  let iamSummaryAvailable = false;
  let iamRolesCount: number | undefined;
  try {
    const iam = new IAMClient({ region: params.region, credentials: tempCreds });
    const summary = await iam.send(new GetAccountSummaryCommand({}));
    iamSummaryAvailable = Boolean(summary.SummaryMap);
    iamRolesCount = summary.SummaryMap?.Roles;
  } catch {
    // Target role may not grant iam:GetAccountSummary; STS identity still succeeded
  }

  return {
    assumedAccountId: caller.Account || '',
    assumedArn: caller.Arn || assumeResp.AssumedRoleUser?.Arn || params.roleArn,
    assumedUserId: caller.UserId || assumeResp.AssumedRoleUser?.AssumedRoleId || '',
    expiration: creds.Expiration ? creds.Expiration.toISOString() : null,
    iamSummaryAvailable,
    iamRolesCount,
  };
}
