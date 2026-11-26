import { Router } from 'express';
import { requireUserSession } from '../../middleware/sessionAuth.ts';
import { AI_KEY_PROVIDERS } from '../../../shared/types.ts';
import { isAiKeyProvider, normalizeAiBaseUrl, verifyAiKey } from './aiKeyAdapter.ts';
import { connectAiKeyAccount } from '../../services/accountService.ts';

export const aiKeyRouter = Router();

aiKeyRouter.post('/providers/ai-key', requireUserSession, async (req, res) => {
  const auth = req.auth!;
  const { provider, apiKey, email, baseUrl } = req.body as {
    provider?: string;
    apiKey?: string;
    email?: string;
    baseUrl?: string;
  };

  if (!provider || !isAiKeyProvider(provider)) {
    res.status(400).json({ error: 'Choose a supported AI provider.' });
    return;
  }
  if (!apiKey || apiKey.trim().length < 8) {
    res.status(400).json({ error: 'Paste the API key for this account.' });
    return;
  }

  const cleanEmail = email?.trim().toLowerCase() || '';
  if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    res.status(400).json({ error: 'Enter a valid email, or leave it blank.' });
    return;
  }

  const option = AI_KEY_PROVIDERS.find((item) => item.id === provider)!;
  let normalizedBase: string | undefined;
  if (option.needsBaseUrl) {
    try {
      normalizedBase = normalizeAiBaseUrl(baseUrl, option.defaultBaseUrl || 'http://localhost:3001');
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid base URL.' });
      return;
    }
  }

  try {
    const verified = await verifyAiKey({
      provider,
      apiKey: apiKey.trim(),
      email: cleanEmail || undefined,
      baseUrl: normalizedBase,
    });
    const account = connectAiKeyAccount({
      workspaceId: auth.workspaceId,
      userId: auth.userId,
      provider,
      verified,
      apiKey: apiKey.trim(),
      baseUrl: normalizedBase,
    });
    res.status(201).json({
      account,
      balanceReported: typeof verified.limitValue === 'number',
      note: verified.notes,
    });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Could not verify this API key.',
    });
  }
});
