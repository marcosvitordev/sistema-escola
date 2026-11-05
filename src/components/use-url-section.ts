'use client';
import { useSearchParams } from 'next/navigation';

// Keep the current section in the URL so reload, browser Back and shared links work.
export function useUrlSection<T extends string>(name: string, fallback: T, options?: readonly T[]): readonly [T, (value: T) => void] {
  const params = useSearchParams();
  const raw = params.get(name) as T | null;
  const value = raw && (!options || options.includes(raw)) ? raw : fallback;
  function navigate(next: T) {
    const url = new URL(window.location.href);
    url.searchParams.set(name, next);
    if (url.href !== window.location.href) window.history.pushState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }
  return [value, navigate];
}
