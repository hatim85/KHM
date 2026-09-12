import React, { useState, useRef, useEffect, useMemo } from 'react';

/**
 * SearchableSelect — a drop-in replacement for <select> with typeahead search.
 * Includes auto-positioning logic (fixed positioning) so dropdown menus are never
 * clipped by parent overflow: hidden or overflow-x: auto containers (tables/cards/modals).
 *
 * Props:
 *   options   – Array of { value, label }
 *   value     – Currently selected value (controlled)
 *   onChange  – (value) => void
 *   placeholder – placeholder text when nothing is selected
 *   required  – HTML required attribute (validated via hidden input)
 *   className – extra classes merged onto the wrapper
 *   disabled  – disables the input
 */
const SearchableSelect = ({
  options = [],
  value,
  onChange,
  placeholder = 'Search...',
  required = false,
  className = '',
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [dropdownStyle, setDropdownStyle] = useState({});

  const wrapperRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Find the label for the currently selected value
  const selectedLabel = useMemo(() => {
    const found = options.find((o) => o.value === value);
    return found ? found.label : '';
  }, [options, value]);

  // Filter options by search text (case-insensitive, matches anywhere)
  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, search]);

  // Reset highlight when filtered list changes
  useEffect(() => {
    setHighlightIndex(-1);
  }, [filtered.length, search]);

  // Calculate dropdown position to break out of overflow: hidden containers
  const updateDropdownPosition = () => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const dropdownHeight = 220; // approximate max dropdown height

      // If space below is limited, open upwards
      const openUpward = spaceBelow < dropdownHeight && rect.top > dropdownHeight;

      // Calculate safe left and width for mobile screens
      const viewportWidth = window.innerWidth;
      const minDropdownWidth = Math.min(260, viewportWidth - 24);
      const computedWidth = Math.max(rect.width, minDropdownWidth);
      const safeWidth = Math.min(computedWidth, viewportWidth - 24);
      let safeLeft = rect.left;
      if (safeLeft + safeWidth > viewportWidth - 12) {
        safeLeft = Math.max(12, viewportWidth - safeWidth - 12);
      }
      safeLeft = Math.max(12, safeLeft);

      setDropdownStyle({
        position: 'fixed',
        left: `${safeLeft}px`,
        width: `${safeWidth}px`,
        maxWidth: 'calc(100vw - 24px)',
        top: openUpward ? 'auto' : `${rect.bottom + 4}px`,
        bottom: openUpward ? `${window.innerHeight - rect.top + 4}px` : 'auto',
        zIndex: 9999,
      });
    }
  };

  useEffect(() => {
    if (isOpen) {
      updateDropdownPosition();
      window.addEventListener('scroll', updateDropdownPosition, true);
      window.addEventListener('resize', updateDropdownPosition);
    }
    return () => {
      window.removeEventListener('scroll', updateDropdownPosition, true);
      window.removeEventListener('resize', updateDropdownPosition);
    };
  }, [isOpen]);

  const dropdownRef = useRef(null);

  // Click-outside handler (supports both mouse and touch devices)
  useEffect(() => {
    const handleClickOutside = (e) => {
      const clickedInsideWrapper = wrapperRef.current && wrapperRef.current.contains(e.target);
      const clickedInsideDropdown = dropdownRef.current && dropdownRef.current.contains(e.target);
      if (!clickedInsideWrapper && !clickedInsideDropdown) {
        setIsOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightIndex >= 0 && listRef.current) {
      const items = listRef.current.children;
      if (items[highlightIndex]) {
        items[highlightIndex].scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightIndex]);

  const handleSelect = (val) => {
    onChange(val);
    setIsOpen(false);
    setSearch('');
    inputRef.current?.blur();
  };

  const handleInputFocus = () => {
    if (disabled) return;
    updateDropdownPosition();
    setIsOpen(true);
    setSearch('');
  };

  const handleInputChange = (e) => {
    setSearch(e.target.value);
    if (!isOpen) {
      updateDropdownPosition();
      setIsOpen(true);
    }
  };

  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        e.preventDefault();
        updateDropdownPosition();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIndex((prev) => (prev < filtered.length - 1 ? prev + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIndex((prev) => (prev > 0 ? prev - 1 : filtered.length - 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightIndex >= 0 && filtered[highlightIndex]) {
          handleSelect(filtered[highlightIndex].value);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setSearch('');
        inputRef.current?.blur();
        break;
      default:
        break;
    }
  };

  // Determine display value for the input
  const displayValue = isOpen ? search : selectedLabel;

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      {/* Hidden input for form validation (required support) */}
      {required && (
        <input
          type="text"
          required
          value={value || ''}
          onChange={() => {}}
          tabIndex={-1}
          style={{
            position: 'absolute',
            opacity: 0,
            width: 0,
            height: 0,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Visible text input */}
      <input
        ref={inputRef}
        type="text"
        value={displayValue}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={handleInputFocus}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        className="w-full bg-white dark:bg-slate-950/60 border border-slate-300 dark:border-slate-700/70 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      />

      {/* Dropdown chevron */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 4.5L6 7.5L9 4.5" />
        </svg>
      </div>

      {/* Dropdown list with fixed positioning relative to viewport */}
      {isOpen && (
        <div
          ref={dropdownRef}
          style={dropdownStyle}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl overflow-hidden animate-in fade-in duration-100"
        >
          <ul
            ref={listRef}
            className="max-h-52 overflow-y-auto py-1 scrollbar-thin"
          >
            {filtered.length === 0 ? (
              <li className="px-4 py-3 text-sm text-slate-400 dark:text-slate-500 italic text-center">
                No matches found
              </li>
            ) : (
              filtered.map((option, idx) => {
                const isHighlighted = idx === highlightIndex;
                const isSelected = option.value === value;
                return (
                  <li
                    key={option.value}
                    onMouseDown={(e) => {
                      e.preventDefault(); // prevent blur
                      handleSelect(option.value);
                    }}
                    onMouseEnter={() => setHighlightIndex(idx)}
                    className={`px-4 py-2.5 text-sm cursor-pointer transition-colors flex items-center justify-between gap-2 ${
                      isHighlighted
                        ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <span className="truncate">{option.label}</span>
                    {isSelected && (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="text-indigo-600 dark:text-indigo-400 shrink-0"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

export default SearchableSelect;

