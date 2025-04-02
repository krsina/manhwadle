import React from 'react';
import { GuessResult } from '../types';
import GuessRow from './GuessRow';

interface GuessResultsListProps {
  guesses: GuessResult[];
}

const GuessResultsList: React.FC<GuessResultsListProps> = ({ guesses }) => {

  const attributeHeaderClasses = `
    flex-1 basis-0      /* Allow grow/shrink starting from 0 */
    min-w-[70px]        /* Minimum width (adjust to match height for square) */
    text-center font-semibold p-1 mx-1 /* Reduced padding slightly */
    text-gray-600 text-xs sm:text-sm box-border
  `;

  const firstHeaderClasses = `
    flex-1 basis-0      /* Allow grow/shrink */
    min-w-[100px]       /* Larger minimum width */
  `;

  return (
    // Let the container fill width up to max-w-5xl, overflow-x-auto for very small screens
    <div className="mt-5 w-full max-w-5xl mx-auto px-1 sm:px-0 overflow-x-auto">
       {guesses.length > 0 && (
         <div className="flex mb-1 px-1 items-stretch">
            <div className={`${attributeHeaderClasses} ${firstHeaderClasses}`.trim().replace(/\s+/g, ' ')}>Character</div>
            <div className={attributeHeaderClasses.trim().replace(/\s+/g, ' ')}>Gender</div>
            <div className={attributeHeaderClasses.trim().replace(/\s+/g, ' ')}>Affiliation</div>
            <div className={attributeHeaderClasses.trim().replace(/\s+/g, ' ')}>Height</div>
            <div className={attributeHeaderClasses.trim().replace(/\s+/g, ' ')}>First Seen</div>
            <div className={attributeHeaderClasses.trim().replace(/\s+/g, ' ')}>Aliases</div>
         </div>
       )}
      {guesses.map((guess, index) => (
        <GuessRow
            key={`${guess.guessedCharacter.id}-${index}`}
            guessResult={guess}
            isNewest={index === 0}
        />
      ))}
    </div>
  );
};

export default GuessResultsList;