import React, { useState, useEffect, useRef } from 'react';
import { Character } from '../types';

interface InputFormProps {
    guess: string;
    onGuessChange: (value: string) => void;
    onSubmit: (event: React.FormEvent) => void;
    availableCharacters: Character[];
    guessedIds: number[]; // Prop for guessed IDs
    disabled?: boolean;
}

const InputForm: React.FC<InputFormProps> = ({
    guess,
    onGuessChange,
    onSubmit,
    availableCharacters,
    guessedIds, // Destructure guessedIds
    disabled = false
}) => {
    const [suggestions, setSuggestions] = useState<Character[]>([]);
    const [isDropdownVisible, setIsDropdownVisible] = useState<boolean>(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const trimmedGuess = guess.trim().toLowerCase();
        let filtered: Character[] = [];

        if (trimmedGuess.length > 0) {
            try {
                 filtered = availableCharacters.filter(char => {
                     if (!char || typeof char.name !== 'string') return false;

                     const nameLower = char.name.toLowerCase();
                     const starts = nameLower.startsWith(trimmedGuess);
                     return starts;
                 });
            } catch (error) {
                 console.error("Error during filtering:", error);
            }
        }

        setSuggestions(filtered); // Update state
        // Visibility logic
        if (document.activeElement === inputRef.current && filtered.length > 0) {
             setIsDropdownVisible(true);
        } else if (trimmedGuess.length === 0) {
             setIsDropdownVisible(false);
        }

    }, [guess, availableCharacters, guessedIds]); 

    // --- Click outside effect ---
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsDropdownVisible(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [containerRef]);

    const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = event.target.value;
        onGuessChange(newValue);
        if (newValue.trim().length > 0) { setIsDropdownVisible(true); }
        else { setIsDropdownVisible(false); }
    };
    const handleSuggestionClick = (character: Character) => {
        onGuessChange(character.name);
        setIsDropdownVisible(false);
        inputRef.current?.focus();
    };
     const handleFocus = () => {
        if(guess.trim().length > 0 && suggestions.length > 0) { // Check suggestions state too
             setIsDropdownVisible(true);
        }
    };

    return (
        <div ref={containerRef} className="relative flex justify-center px-2 mb-5 w-full max-w-2xs mx-auto">
            <form onSubmit={onSubmit} className="flex w-full space-x-1">
                <input
                    ref={inputRef}
                    type="text"
                    name="guess"
                    value={guess}
                    onChange={handleInputChange}
                    onFocus={handleFocus}
                    placeholder="Enter character name..."
                    autoComplete="off"
                    disabled={disabled}
                    className="px-3 py-2 text-base border border-gray-300 rounded-md flex-grow focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-60 disabled:cursor-not-allowed text-gray-900"
                />
                <button> Submit </button>
            </form>

            {isDropdownVisible && Array.isArray(suggestions) && suggestions.length > 0 && (
                <ul className="absolute top-full left-2 right-18 mt-1 bg-white border border-gray-300 rounded-md list-none p-0 max-h-60 overflow-y-auto z-10 shadow-lg">
                    {suggestions.map((char) => (
                        <li
                            key={char?.id || Math.random()} // Added fallback key for safety
                            onMouseDown={() => handleSuggestionClick(char)}
                            className="px-3 py-2 cursor-pointer border-b border-gray-100 last:border-b-0 hover:bg-gray-100 text-gray-900"
                            tabIndex={-1}
                        >
                            {char?.name || 'Error'} 
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

export default InputForm;