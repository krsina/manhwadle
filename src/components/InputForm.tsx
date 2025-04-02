import React, { useState, useEffect, useRef } from 'react';
import { Character } from '../types'; // Import Character type

interface InputFormProps {
    guess: string;
    onGuessChange: (value: string) => void;
    onSubmit: (event: React.FormEvent) => void;
    availableCharacters: Character[];
    disabled?: boolean;
}

const InputForm: React.FC<InputFormProps> = ({
    guess,
    onGuessChange,
    onSubmit,
    availableCharacters,
    disabled = false
}) => {
    const [suggestions, setSuggestions] = useState<Character[]>([]);
    // State to control the *potential* visibility of the dropdown container
    const [isDropdownVisible, setIsDropdownVisible] = useState<boolean>(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Effect to filter suggestions based on the current guess value
    useEffect(() => {
        if (guess.trim().length > 0) {
            const filtered = availableCharacters.filter(char =>
                char.name.toLowerCase().includes(guess.toLowerCase())
            );
            setSuggestions(filtered);
            // If input has focus and we found suggestions, ensure dropdown is visible
            if (document.activeElement === inputRef.current && filtered.length > 0) {
                setIsDropdownVisible(true);
            }
        } else {
            setSuggestions([]);
            setIsDropdownVisible(false); // Hide dropdown if input is empty
        }
    }, [guess, availableCharacters]); // Re-run when guess or available characters change

     // Effect to hide dropdown when clicking outside the component
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
    }, [containerRef]); // Depend only on the container ref

    // Handle changes in the input field
    const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = event.target.value;
        onGuessChange(newValue); // Update parent state
        // If the user is typing something, make the dropdown visible
        // The actual rendering depends on whether suggestions are available
        if (newValue.trim().length > 0) {
             setIsDropdownVisible(true);
        } else {
             setIsDropdownVisible(false); // Hide if input is cleared by typing
        }
    };

    // Handle clicking on a suggestion item
    const handleSuggestionClick = (character: Character) => {
        onGuessChange(character.name); // Set input value
        setIsDropdownVisible(false); // Hide dropdown after selection
        inputRef.current?.focus(); // Re-focus the input field
    };

    // Handle when the input field gains focus
    const handleFocus = () => {
        // Show the dropdown container if there's already text in the input
        // (suggestions will be populated by the useEffect)
        if(guess.trim().length > 0) {
             setIsDropdownVisible(true);
        }
    }

    return (
        // Container with ref for click-outside detection
        <div ref={containerRef} className="relative flex justify-center mb-5 w-full max-w-md mx-auto">
            <form onSubmit={onSubmit} className="flex w-full">
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
                    className="px-3 py-2 text-base border border-gray-300 rounded-l-md flex-grow focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-60 disabled:cursor-not-allowed text-gray-900" /* Explicit text color */
                />
                <button
                    type="submit"
                    disabled={disabled}
                    className="px-4 py-2 text-base bg-purple-700 text-white border-none rounded-r-md cursor-pointer transition hover:bg-purple-800 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                    Submit
                </button>
            </form>

            {/* Suggestions Dropdown: Render only if visibility flag is true AND there are suggestions */}
            {isDropdownVisible && suggestions.length > 0 && (
                <ul
                  className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-md list-none p-0 max-h-60 overflow-y-auto z-10 shadow-lg" /* z-10 is usually enough */
                >
                    {suggestions.map((char) => (
                        <li
                            key={char.id}
                            onMouseDown={() => handleSuggestionClick(char)} // Use onMouseDown for better interaction with focus/blur
                            className="px-3 py-2 cursor-pointer border-b border-gray-100 last:border-b-0 hover:bg-gray-100 text-gray-900"
                            tabIndex={-1} // Prevent list item from taking focus
                        >
                            {char.name}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

export default InputForm;