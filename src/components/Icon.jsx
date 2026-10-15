import { lazy, Suspense } from 'react';
import dynamicIconImports from 'lucide-react/dynamicIconImports';

export const ICON_NAMES = Object.keys(dynamicIconImports);
const cache = new Map();

function load(name) {
  const key = dynamicIconImports[name] ? name : 'circle';
  if (!cache.has(key)) cache.set(key, lazy(dynamicIconImports[key]));
  return cache.get(key);
}

/** Black line icon by lucide name, loaded on demand. */
export default function Icon({ name, size = 20, strokeWidth = 1.6, color = 'currentColor', ...rest }) {
  const Cmp = load(name);
  return (
    <Suspense fallback={<span style={{ display: 'inline-block', width: size, height: size }} />}>
      <Cmp size={size} strokeWidth={strokeWidth} color={color} aria-hidden="true" {...rest} />
    </Suspense>
  );
}
