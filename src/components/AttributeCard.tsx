import React, { useState, useEffect } from 'react';
import { AttributeResult } from '../types';

// Add isNewest to props interface
interface AttributeCardProps {
  attributeName: string;
  value: string | string[] | number;
  result: AttributeResult;
  index: number;
  isNewest: boolean; // Add this prop
}

const AttributeCard: React.FC<AttributeCardProps> = ({ attributeName, value, result, index, isNewest }) => {
  // Initialize state based on isNewest: Start flipped if NOT newest
  const [isFlipped, setIsFlipped] = useState(!isNewest);

  // Trigger flip only for the newest row's cards
  useEffect(() => {
    let timer: NodeJS.Timeout | undefined;
    // Only run the animation if this card belongs to the newest row
    if (isNewest) {
      timer = setTimeout(() => {
        setIsFlipped(true);
      }, 100 + index * 800); // Stagger delay calculation remains
    }
    // If not newest, isFlipped starts true, so no timer needed

    return () => {
        if (timer) {
            clearTimeout(timer); // Cleanup timer on unmount or if props change
        }
    };
    // Depend on isNewest and index
  }, [isNewest, index]);

  const getResultClasses = (): string => {
    // Color logic remains the same
    switch (result) {
      case 'correct': return 'bg-green-600 border-green-700';
      case 'partial': case 'higher': case 'lower': case 'earlier': case 'later': return 'bg-orange-500 border-orange-700';
      case 'incorrect': default: return 'bg-red-600 border-red-700';
    }
  };

  const displayValue = Array.isArray(value) ? value.join(', ') || 'None' : value.toString();
  let partialIndicator = '';
  if (result === 'higher' || result === 'later') partialIndicator = '⬆️';
  if (result === 'lower' || result === 'earlier') partialIndicator = '⬇️';

  // Base styling classes
  const cardBaseStyles = `
    flex-1 border p-2 m-1 rounded-md text-center min-w-[100px]
    text-white flex flex-col justify-center items-center h-[70px]
    box-border overflow-hidden whitespace-normal
    [transform-style:preserve-3d]
  `;

  // Apply transitions ONLY if it's the newest card animating
  const transitionClasses = isNewest ? 'transition-transform duration-1000 ease-in-out' : '';

  // Apply rotation: Start rotated if not newest, otherwise rotate based on state
  const rotationClasses = isFlipped ? '[transform:rotateY(180deg)]' : '';

  // Apply background: Show final color if not newest, otherwise animate from gray
  const backgroundClasses = isFlipped ? getResultClasses() : (isNewest ? 'bg-gray-400 border-gray-500' : getResultClasses());

  // Combine all classes for the card container
  const cardClasses = `
    ${cardBaseStyles}
    ${transitionClasses}
    ${rotationClasses}
    ${backgroundClasses}
  `;

  // Content visibility: Show immediately if not newest, otherwise fade in after delay
  const contentOpacityClasses = isFlipped ? `opacity-100 ${isNewest ? 'delay-300' : ''}` : 'opacity-0';
  const contentClasses = `
    transition-opacity duration-100 ease-in
    ${contentOpacityClasses}
  `;

  return (
    <div className={cardClasses.trim().replace(/\s+/g, ' ')}>
      {/* Inner div rotates content, no change needed here */}
      <div className={`w-full h-full flex flex-col justify-center items-center ${isFlipped ? '[transform:rotateY(180deg)]' : ''}`}>
        <div className={contentClasses.trim().replace(/\s+/g, ' ')}>
          <div className="font-bold break-words text-sm sm:text-base">
            {displayValue}
            {partialIndicator && <span className="ml-1">{partialIndicator}</span>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AttributeCard;