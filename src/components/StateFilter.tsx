'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { StateStats } from '@/lib/types';

interface StateFilterProps {
  states: StateStats[];
  onSelect: (uf: string | null) => void;
}

export default function StateFilter({ states, onSelect }: StateFilterProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const sortedStates = [...states].sort((a, b) => a.uf.localeCompare(b.uf));

  const handleSelect = (uf: string | null) => {
    setSelected(uf);
    onSelect(uf);
    setIsOpen(false);
  };

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close dropdown on Escape key
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
    }
  }, []);

  return (
    <div className="relative" ref={containerRef} onKeyDown={handleKeyDown}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={`Filtrar estado: ${selected || 'Brasil (todos)'}`}
        className="flex items-center gap-2 bg-gray-900/90 backdrop-blur-md border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-gray-800/90 transition-colors shadow-lg"
      >
        <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" />
        </svg>
        <span>{selected || 'Brasil (todos)'}</span>
        <svg className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label="Selecionar estado"
          className="absolute top-full mt-1 left-0 w-56 max-h-80 overflow-y-auto bg-gray-900/95 backdrop-blur-md border border-gray-700 rounded-lg shadow-2xl z-50"
        >
          <button
            role="option"
            aria-selected={!selected}
            onClick={() => handleSelect(null)}
            className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-800 transition-colors ${
              !selected ? 'text-cyan-400 font-medium' : 'text-gray-300'
            }`}
          >
            🇧🇷 Brasil (todos)
          </button>
          <div className="h-px bg-gray-700" />
          {sortedStates.map((state) => (
            <button
              key={state.uf}
              role="option"
              aria-selected={selected === state.uf}
              onClick={() => handleSelect(state.uf)}
              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-800 transition-colors flex justify-between ${
                selected === state.uf ? 'text-cyan-400 font-medium' : 'text-gray-300'
              }`}
            >
              <span>{state.uf} — {state.nomeEstado}</span>
              <span className="text-[10px] text-gray-500">{state.municipiosOriginal}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
