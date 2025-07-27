import { useState } from 'react';

// A self-contained component to test the character service via a button and modal.
// Service functions are now loaded dynamically to prevent render-blocking errors.
export default function ApiTestButton() {
  // State to control the visibility of the log modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  // State to hold log messages to display in the modal
  const [logs, setLogs] = useState<string[]>([]);
  // State to track if the test is currently running
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Adds a new message to the on-screen log.
   * @param message - The message to log.
   */
  const log = (message: string) => {
    console.log(message); // Also log to the browser console
    setLogs(prev => [...prev, `> ${message}`]);
  };

  /**
   * Handles the entire test sequence with one click.
   */
  const handleRunAllTests = async () => {
    setIsLoading(true);
    setIsModalOpen(true);
    setLogs(['--- Starting Full Test Sequence ---']);
    let newCharacterId: number | null = null;

    try {
      // Dynamically import the service functions only when needed.
      // This prevents errors in the service from crashing the app on initial render.
      const {
        createCharacter,
        addAliases,
        getCharacterById,
        updateCharacter,
        updateAliases,
        deleteCharacter
      } = await import('../services/characters');

      // 1. CREATE
      log('[1. CREATE] Attempting to create character...');
      newCharacterId = await createCharacter({
        name: 'Cheong Myeong',
        gender: 'Male',
        affiliation: 'Mount Hua Sect',
        height: 175,
        first_seen: 1,
      });

      if (!newCharacterId) {
        throw new Error('Character creation failed. Aborting.');
      }
      await addAliases(newCharacterId, ['Plum Blossom Sword Saint', 'Chung Myung']);
      log(`✅ Character created with ID: ${newCharacterId}`);

      // 2. READ
      log(`[2. READ] Fetching character ID ${newCharacterId}...`);
      const created = await getCharacterById(newCharacterId);
      log(`✅ Fetched: ${JSON.stringify(created?.character.name)}`);


      // 3. UPDATE
      log(`[3. UPDATE] Updating character ID ${newCharacterId}...`);
      await updateCharacter(newCharacterId, { height: 176 });
      await updateAliases(newCharacterId, ['Plum Blossom Sword Saint', 'Sword Demon']);
      const updated = await getCharacterById(newCharacterId);
      log(`✅ Updated height to: ${updated?.character.height}`);
      log(`✅ Updated aliases to: ${JSON.stringify(updated?.aliases)}`);

    } catch (error: any) {
      log(`❌ ERROR: ${error.message}`);
      log(`💡 Tip: Check the browser console for more details. Is your Supabase client configured correctly in services/characters.ts?`);
    } finally {
      // 4. DELETE
      // if (newCharacterId) {
      //   // We need to re-import if the try block failed before delete was defined
      //   const { deleteCharacter, getCharacterById } = await import('../services/characters');
      //   log(`[4. DELETE] Deleting character ID ${newCharacterId}...`);
      //   const success = await deleteCharacter(newCharacterId);
      //   if (success) {
      //     log(`✅ Character deleted successfully.`);
      //   } else {
      //     log(`❌ Deletion failed.`);
      //   }
      // }
      log('--- Test Sequence Finished ---');
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* The button that triggers the test sequence */}
      <button
        onClick={handleRunAllTests}
        disabled={isLoading}
        className="bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-2 px-4 rounded-lg shadow-lg transition-transform transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-opacity-75 disabled:bg-gray-500 disabled:cursor-not-allowed"
      >
        {isLoading ? 'Running Tests...' : 'Run API Test Sequence'}
      </button>

      {/* Modal for displaying logs */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-lg shadow-xl w-full max-w-2xl border border-gray-700">
            <div className="p-4 border-b border-gray-700 flex justify-between items-center">
                <h2 className="text-xl font-bold text-cyan-400">API Test Log</h2>
                <button 
                    onClick={() => setIsModalOpen(false)}
                    disabled={isLoading}
                    className="text-gray-400 hover:text-white disabled:text-gray-600"
                >
                    &times;
                </button>
            </div>
            <div className="p-4 h-96 overflow-y-auto font-mono text-sm">
              {logs.map((msg, index) => (
                <p key={index} className={`whitespace-pre-wrap ${msg.startsWith('❌') ? 'text-red-400' : msg.startsWith('✅') ? 'text-green-400' : 'text-gray-300'}`}>
                  {msg}
                </p>
              ))}
            </div>
            <div className="p-4 border-t border-gray-700 text-right">
                <button 
                    onClick={() => setIsModalOpen(false)}
                    disabled={isLoading}
                    className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 disabled:bg-gray-800 disabled:cursor-not-allowed"
                >
                    Close
                </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
