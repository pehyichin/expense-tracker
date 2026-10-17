// 240° arc. The allowance sits at 75% of the arc; the last 25% shows overspend, hatched.
const R = 120, C = 2 * Math.PI * R, L = (240 / 360) * C, A = 0.75 * L;

export default function BudgetArc({ spent, allowance, children }) {
  const fill = allowance > 0 ? Math.min(spent / allowance, 1) * A : spent > 0 ? A : 0;
  const overAmt = Math.max(0, spent - allowance);
  const over = allowance > 0 ? Math.min((overAmt / allowance) * A, 0.25 * L) : overAmt > 0 ? 0.25 * L : 0;
  return (
    <div style={{ position: 'relative', height: 214, display: 'flex', justifyContent: 'center' }}>
      <svg width="290" height="214" viewBox="0 8 300 222" aria-hidden="true">
        <defs>
          <pattern id="arc-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="#EAF0E6" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="#C8644A" strokeWidth="3" />
          </pattern>
        </defs>
        <circle cx="150" cy="150" r={R} fill="none" stroke="#EAF0E6" strokeWidth="22" strokeLinecap="round" strokeDasharray={`${L} ${C}`} transform="rotate(150 150 150)" />
        {over > 0.5 && (
          <circle cx="150" cy="150" r={R} fill="none" stroke="url(#arc-hatch)" strokeWidth="22" strokeDasharray={`0 ${A} ${over} ${C}`} transform="rotate(150 150 150)" />
        )}
        {fill > 0.5 && (
          <circle cx="150" cy="150" r={R} fill="none" stroke="#111111" strokeWidth="22" strokeLinecap="round" strokeDasharray={`${fill} ${C}`} transform="rotate(150 150 150)" />
        )}
        <line x1="240.1" y1="98" x2="267.8" y2="82" stroke="#111111" strokeWidth="2" />
        <circle cx="268.6" cy="81.5" r="6" fill="#EDF59A" stroke="#111111" strokeWidth="2" />
      </svg>
      <div style={{ position: 'absolute', top: 84, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        {children}
      </div>
    </div>
  );
}
