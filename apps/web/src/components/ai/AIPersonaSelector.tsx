import React from "react";
import type { AiPersona } from "../../types/shell";

type AIPersonaSelectorProps = {
  value: AiPersona;
  onChange: (persona: AiPersona) => void;
  className?: string;
};

type PersonaOption = {
  id: AiPersona;
  label: string;
  description: string;
  icon: string;
};

const PERSONA_OPTIONS: PersonaOption[] = [
  {
    id: "balanced",
    label: "Balanced",
    description: "Best of both worlds - clear and thorough",
    icon: "\u2696"
  },
  {
    id: "detailed",
    label: "Detailed",
    description: "Comprehensive explanations with full context",
    icon: "\u2261"
  },
  {
    id: "concise",
    label: "Concise",
    description: "Quick, to-the-point responses",
    icon: "\u26A1"
  }
];

export const AIPersonaSelector: React.FC<AIPersonaSelectorProps> = ({
  value,
  onChange,
  className = ""
}) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const selected = PERSONA_OPTIONS.find((option) => option.id === value) || PERSONA_OPTIONS[0];

  return (
    <div className={`ai-persona-selector ${className}`.trim()} ref={menuRef}>
      <button
        type="button"
        className="persona-trigger"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="persona-icon">{selected.icon}</span>
        <span className="persona-label">{selected.label}</span>
        <span className="persona-chevron">{isOpen ? "\u25BC" : "\u25B6"}</span>
      </button>
      {isOpen && (
        <ul className="persona-menu" role="listbox">
          {PERSONA_OPTIONS.map((option) => (
            <li
              key={option.id}
              role="option"
              aria-selected={value === option.id}
              className={`persona-option${value === option.id ? " selected" : ""}`}
              onClick={() => {
                onChange(option.id);
                setIsOpen(false);
              }}
            >
              <span className="option-icon">{option.icon}</span>
              <div className="option-content">
                <span className="option-label">{option.label}</span>
                <span className="option-description">{option.description}</span>
              </div>
              {value === option.id && <span className="option-check">\u2713</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default AIPersonaSelector;
