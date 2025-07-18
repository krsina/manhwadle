import React from 'react';
import { GuessResult } from '../types';
import GuessRow from './GuessRow';

interface GuessResultsListProps {
  guesses: GuessResult[];
}

const GuessResultsList: React.FC<GuessResultsListProps> = ({ guesses }) => {

  const attributeHeaderClasses = `
    flex-1 basis-0      /* Match AttributeCard flex sizing */
    min-w-[70px]        /* Match AttributeCard minimum width */
    text-center font-semibold p-1 mx-1
    text-gray-600 text-xs sm:text-sm box-border
    h-[40px]           /* Fixed height for header */
    flex items-center justify-center
  `;

  const firstHeaderClasses = `
    min-w-[70px]       /* Match first AttributeCard larger minimum width */
  `;

  return (
    <div className="w-full max-w-5xl mx-auto overflow-x-auto">
       {guesses.length > 0 && (
         <div className="flex px-1 items-stretch">
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