import Dexie, { type Table } from 'dexie';

export interface Vocabulary {
  id?: number;
  term: string;
  chinese: string;
  english: string;
  japanese: string;
  context: string;
  created_at: number;
}

const db = new Dexie('VocabDB') as Dexie & {
  vocabularies: Table<Vocabulary, number>;
};

db.version(1).stores({
  vocabularies: '++id, term, created_at',
});

export type AddVocabularyInput = Omit<Vocabulary, 'id' | 'created_at'>;

/**
 * 添加一条生词记录，id 与 created_at 由库自动填充。
 * @returns 新插入条目的主键 id
 */
export async function addVocabulary(entry: AddVocabularyInput): Promise<number> {
  const created_at = Date.now();
  return await db.vocabularies.add({
    ...entry,
    created_at,
  });
}

/**
 * 获取生词本中全部词条，按创建时间倒序。
 */
export async function getAllVocabularies(): Promise<Vocabulary[]> {
  return await db.vocabularies.orderBy('created_at').reverse().toArray();
}

export { db };

