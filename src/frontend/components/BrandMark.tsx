import type { CreditProviderType } from '../../shared/types';

export function AetherGateLogo({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="ag-logo-bg" x1="2" y1="2" x2="30" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1B2332" />
          <stop offset="100%" stopColor="#0A0E16" />
        </linearGradient>
        <linearGradient id="ag-logo-prism" x1="8" y1="7" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#5AC8FA" />
          <stop offset="100%" stopColor="#0A84FF" />
        </linearGradient>
      </defs>
      <rect
        x="1"
        y="1"
        width="30"
        height="30"
        rx="8.5"
        fill="url(#ag-logo-bg)"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth="1.25"
      />
      <path d="M16 7L24 22.5H20.4L16 13.7L11.6 22.5H8L16 7Z" fill="url(#ag-logo-prism)" />
      <circle cx="16" cy="20.5" r="2.15" fill="#F5F7FA" />
    </svg>
  );
}

export const AccountBridgeLogo = AetherGateLogo;

export function ProviderIcon({
  provider,
  size = 18,
}: {
  provider: CreditProviderType | 'system';
  size?: number;
}) {
  if (provider === 'google') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="#EA4335"
          d="M12 5c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.19 14.97 0 12 0 7.31 0 3.25 2.69 1.27 6.6l3.67 2.85C5.8 6.86 8.65 5 12 5z"
        />
        <path
          fill="#4285F4"
          d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58l3.7 2.87c2.16-2 3.72-4.95 3.72-8.69z"
        />
        <path
          fill="#FBBC05"
          d="M4.94 14.55c-.22-.66-.35-1.36-.35-2.05s.13-1.39.35-2.05L1.27 7.6C.46 9.21 0 11.05 0 12.5s.46 3.29 1.27 4.9l3.67-2.85z"
        />
        <path
          fill="#34A853"
          d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.7-2.87c-1.08.72-2.45 1.16-4.23 1.16-3.35 0-6.2-1.86-7.06-4.45L1.27 17.78C3.25 21.69 7.31 24 12 24z"
        />
      </svg>
    );
  }

  if (provider === 'github') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
        />
      </svg>
    );
  }

  if (provider === 'aws' || provider === 'aws_builder_id' || provider === 'aws_identity_center') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M5.5 14.5C8.5 17.2 15.5 17.2 18.8 14.3"
          stroke="#FF9F0A"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
        <path
          d="M17.2 13.7L19.4 14.1L18.9 16.3"
          stroke="#FF9F0A"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M6.8 11.2L8.7 5.8L10.6 11.2M7.4 9.6H10M12.2 5.8L13.3 11.2L14.5 6.8L15.7 11.2L16.8 5.8"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (provider === 'kiro') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="5" stroke="#0A84FF" strokeWidth="1.75" />
        <path d="M9 7.5V16.5M9 12L14.8 7.5M11.6 10.2L15.2 16.5" stroke="#5AC8FA" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (
    provider === 'cursor' ||
    provider === 'windsurf' ||
    provider === 'openrouter' ||
    provider === 'groq' ||
    provider === 'huggingface' ||
    provider === 'cerebras' ||
    provider === 'mistral' ||
    provider === 'cohere' ||
    provider === 'nvidia' ||
    provider === 'freellmapi'
  ) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 3L20 7.5V16.5L12 21L4 16.5V7.5L12 3Z" stroke="#30D158" strokeWidth="1.65" strokeLinejoin="round" />
        <circle cx="12" cy="12" r="2.5" fill="#30D158" />
      </svg>
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="4" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9 9H15M9 12H13M9 15H14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function formatProviderName(provider: CreditProviderType | 'system'): string {
  switch (provider) {
    case 'google':
      return 'Google';
    case 'github':
      return 'GitHub';
    case 'aws':
      return 'AWS IAM Role';
    case 'aws_builder_id':
      return 'AWS Builder ID';
    case 'aws_identity_center':
      return 'AWS IAM Identity Center';
    case 'kiro':
      return 'Kiro AI';
    case 'cursor':
      return 'Cursor';
    case 'windsurf':
      return 'Windsurf';
    case 'openrouter':
      return 'OpenRouter';
    case 'groq':
      return 'Groq';
    case 'huggingface':
      return 'Hugging Face';
    case 'cerebras':
      return 'Cerebras';
    case 'mistral':
      return 'Mistral';
    case 'cohere':
      return 'Cohere';
    case 'nvidia':
      return 'NVIDIA';
    case 'freellmapi':
      return 'FreeLLMAPI';
    case 'system':
      return 'AetherGate';
  }
}
