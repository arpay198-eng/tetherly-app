'use client';

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

const gradients = [
  ['#667eea', '#764ba2'],
  ['#f093fb', '#f5576c'],
  ['#4facfe', '#00f2fe'],
  ['#43e97b', '#38f9d7'],
  ['#fa709a', '#fee140'],
  ['#a18cd1', '#fbc2eb'],
  ['#fccb90', '#d57eeb'],
  ['#e0c3fc', '#8ec5fc'],
  ['#f5576c', '#ff6a88'],
  ['#667eea', '#00f2fe'],
  ['#89f7fe', '#66a6ff'],
  ['#fddb92', '#d1fdff'],
  ['#9890e3', '#b1f4cf'],
  ['#ebc0fd', '#d9ded8'],
  ['#f6d365', '#fda085'],
  ['#fbc2eb', '#a6c1ee'],
];

const patterns = [
  (c1: string, c2: string) => (
    <>
      <circle cx="50" cy="38" r="22" fill={c1} />
      <circle cx="50" cy="90" r="36" fill={c1} />
    </>
  ),
  (c1: string, c2: string) => (
    <>
      <rect x="15" y="15" width="70" height="70" rx="14" fill={c1} />
      <circle cx="50" cy="85" r="30" fill={c1} />
    </>
  ),
  (c1: string, c2: string) => (
    <>
      <polygon points="50,10 90,75 10,75" fill={c1} />
      <circle cx="50" cy="88" r="28" fill={c1} />
    </>
  ),
  (c1: string, c2: string) => (
    <>
      <rect x="20" y="20" width="60" height="60" rx="30" fill={c1} />
      <rect x="30" y="70" width="40" height="30" rx="20" fill={c1} />
    </>
  ),
  (c1: string, c2: string) => (
    <>
      <path d="M50 15 C25 15 15 35 15 50 C15 75 35 85 50 85 C65 85 85 75 85 50 C85 35 75 15 50 15Z" fill={c1} />
      <circle cx="50" cy="90" r="25" fill={c1} />
    </>
  ),
];

interface AvatarProps {
  name: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export default function Avatar({ name, size = 90, className = '', style = {} }: AvatarProps) {
  const hash = hashCode(name || 'User');
  const [c1, c2] = gradients[hash % gradients.length];
  const pattern = patterns[hash % patterns.length];
  const initials = (name || 'U')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      style={{ borderRadius: '50%', ...style }}
    >
      <defs>
        <linearGradient id={`grad-${hash}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={c1} />
          <stop offset="100%" stopColor={c2} />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#grad-${hash})`} />
      {pattern(c1, c2)}
      <text
        x="50"
        y="56"
        textAnchor="middle"
        dominantBaseline="middle"
        fill="white"
        fontSize="32"
        fontWeight="700"
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        {initials}
      </text>
    </svg>
  );
}
