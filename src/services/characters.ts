import { supabase } from '../lib/supabaseClient';

// Interfaces matching the database schema
export interface DBCharacter {
  id?: number;
  name: string;
  gender?: string;
  affiliation?: string; // Corrected typo: affilliation -> affiliation
  height?: number;
  first_seen?: number;
}

export interface CharacterAlias {
  alias_id?: number;
  character_id: number;
  alias_name: string;
}

/**
 * Create a new character in the database.
 * @param character - The character object to create.
 * @returns The ID of the newly created character, or null on failure.
 */
export async function createCharacter(character: DBCharacter): Promise<number | null> {
  const { data, error } = await supabase
    .from('characters')
    .insert(character)
    .select('id')
    .single();

  if (error) {
    console.error('Error creating character:', error);
    return null;
  }

  return data?.id || null;
}

/**
 * Add aliases for a specific character.
 * @param characterId - The ID of the character to add aliases for.
 * @param aliases - An array of alias strings.
 * @returns True on success, false on failure.
 */
export async function addAliases(characterId: number, aliases: string[]): Promise<boolean> {
  if (aliases.length === 0) return true; // Nothing to add

  const aliasObjects = aliases.map(alias => ({
    character_id: characterId,
    alias_name: alias,
  }));

  const { error } = await supabase
    .from('character_aliases')
    .insert(aliasObjects);

  if (error) {
    console.error('Error adding aliases:', error);
    return false;
  }

  return true;
}

/**
 * Get a single character by its ID, including its aliases.
 * This version is optimized to use a single query.
 * @param id - The ID of the character to fetch.
 * @returns A character object with its aliases, or null if not found.
 */
export async function getCharacterById(id: number): Promise<{ character: DBCharacter; aliases: string[] } | null> {
  const { data, error } = await supabase
    .from('characters')
    .select(`
      *,
      character_aliases (
        alias_name
      )
    `)
    .eq('id', id)
    .single();

  if (error || !data) {
    console.error(`Error fetching character with ID ${id}:`, error);
    return null;
  }

  // Destructure the aliases from the main character data
  const { character_aliases, ...characterData } = data;

  return {
    character: characterData,
    aliases: character_aliases.map((alias: any) => alias.alias_name),
  };
}

/**
 * Get all characters with their aliases.
 * This version is optimized to prevent the N+1 query problem.
 * @returns An array of character objects, each with its list of aliases.
 */
export async function getAllCharacters(): Promise<{ character: DBCharacter; aliases: string[] }[]> {
  const { data, error } = await supabase
    .from('characters')
    .select(`
      *,
      character_aliases (
        alias_name
      )
    `);

  if (error) {
    console.error('Error fetching characters with aliases:', error);
    return [];
  }

  if (!data) return [];

  // Map the Supabase response to the desired structured format
  return data.map(item => {
    const { character_aliases, ...characterData } = item;
    return {
      character: characterData,
      aliases: character_aliases.map((alias: any) => alias.alias_name),
    };
  });
}

/**
 * Update a character's top-level details in the database.
 * @param id - The ID of the character to update.
 * @param updatedCharacter - An object with the character fields to update.
 * @returns True on success, false on failure.
 */
export async function updateCharacter(id: number, updatedCharacter: Partial<DBCharacter>): Promise<boolean> {
  const { error } = await supabase
    .from('characters')
    .update(updatedCharacter)
    .eq('id', id);

  if (error) {
    console.error(`Error updating character with ID ${id}:`, error);
    return false;
  }

  return true;
}

/**
 * Replaces all aliases for a character with a new list.
 * Note: This is not a true transaction. For production, consider an RPC function.
 * @param characterId - The ID of the character whose aliases will be updated.
 * @param aliases - The new array of alias strings.
 * @returns True on success, false on failure.
 */
export async function updateAliases(characterId: number, aliases: string[]): Promise<boolean> {
  // 1. Delete all existing aliases for the character
  const { error: deleteError } = await supabase
    .from('character_aliases')
    .delete()
    .eq('character_id', characterId);

  if (deleteError) {
    console.error(`Error deleting existing aliases for character ${characterId}:`, deleteError);
    return false;
  }

  // 2. Add the new aliases
  return addAliases(characterId, aliases);
}

/**
 * Delete a character from the database.
 * Assumes 'ON DELETE CASCADE' is set for the foreign key in 'character_aliases'.
 * @param id - The ID of the character to delete.
 * @returns True on success, false on failure.
 */
export async function deleteCharacter(id: number): Promise<boolean> {
  const { error } = await supabase
    .from('characters')
    .delete()
    .eq('id', id);

  if (error) {
    console.error(`Error deleting character with ID ${id}:`, error);
    return false;
  }

  return true;
}
