import React from 'react';
import { GuessResult } from '../types';
import AttributeCard from './AttributeCard'; // Make sure AttributeCardProps includes isNewest

// Add isNewest to props interface
interface GuessRowProps {
  guessResult: GuessResult;
  isNewest: boolean; // Add this prop
}

const GuessRow: React.FC<GuessRowProps> = ({ guessResult, isNewest }) => { // Destructure isNewest
  const { guessedCharacter, comparison } = guessResult;
  const attributes = [
      { name: "Gender", value: guessedCharacter.gender, result: comparison.gender },
      { name: "Affiliation", value: guessedCharacter.affiliation, result: comparison.affiliation },
      { name: "Height", value: guessedCharacter.height, result: comparison.height },
      { name: "First Seen", value: `Ch. ${guessedCharacter.firstSeenChapter}`, result: comparison.firstSeenChapter },
      { name: "Aliases", value: guessedCharacter.aliases, result: comparison.aliases },
  ];

  return (
    <div className="flex items-stretch mb-2 bg-gray-50 rounded-lg shadow-sm p-1">
      <div className="flex items-center justify-center font-bold p-2 m-1 border border-gray-300
    rounded-md bg-gray-200 min-w-[120px] text-center text-sm sm:text-base">
          {guessedCharacter.name}
      </div>
      {attributes.map((attr, index) => (
          <AttributeCard
              key={attr.name}
              attributeName={attr.name}
              value={attr.value}
              result={attr.result}
              index={index}
              isNewest={isNewest} // Pass isNewest down to the card
          />
      ))}
    </div>
  );
};

export default GuessRow;