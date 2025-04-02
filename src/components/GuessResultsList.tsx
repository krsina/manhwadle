import React from 'react';
import { GuessResult } from '../types';
import GuessRow from './GuessRow'; // Make sure GuessRowProps includes isNewest

interface GuessResultsListProps {
  guesses: GuessResult[];
}

const GuessResultsList: React.FC<GuessResultsListProps> = ({ guesses }) => {

  const headerBaseClasses = `
    flex-1 text-center font-semibold p-2 m-1 min-w-[100px]
    text-gray-600 text-xs sm:text-sm box-border
  `;
  const firstHeaderClasses = `
    min-w-[120px] grow-0 shrink-0 basis-[calc(120px+1.5rem)]
  `;

  return (
    <div className="mt-5 w-full max-w-5xl mx-auto px-1 sm:px-0">
       {guesses.length > 0 && (
         <div className="flex mb-1 px-1 items-stretch">
            <div className={`${headerBaseClasses} ${firstHeaderClasses}`.trim().replace(/\s+/g, ' ')}>Character</div>
            <div className={headerBaseClasses.trim().replace(/\s+/g, ' ')}>Gender</div>
            <div className={headerBaseClasses.trim().replace(/\s+/g, ' ')}>Affiliation</div>
            <div className={headerBaseClasses.trim().replace(/\s+/g, ' ')}>Height</div>
            <div className={headerBaseClasses.trim().replace(/\s+/g, ' ')}>First Seen</div>
            <div className={headerBaseClasses.trim().replace(/\s+/g, ' ')}>Aliases</div>
         </div>
       )}
      {/* Pass isNewest prop based on index */}
      {guesses.map((guess, index) => (
        <GuessRow
            key={`${guess.guessedCharacter.id}-${index}`} // Using index in key is okay if list order is stable or prepended
            guessResult={guess}
            isNewest={index === 0} // Pass true only for the first item (most recent)
        />
      ))}
    </div>
  );
};

export default GuessResultsList;