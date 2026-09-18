/**
 * @fileoverview Local bookmarks storage with folder support.
 * Returns bookmarks in a tree structure for rendering.
 * @module desktop/storage/bookmarks
 */

'use strict';

const { getDb } = require('./db');

let stmts = null;

function prepareStatements() {
  if (stmts) return stmts;
  const db = getDb();

  stmts = {
    /* Bookmarks */
    insertBookmark: db.prepare(`
      INSERT INTO local_bookmarks (url, title, favicon_url, folder_id, position, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `),
    getAllBookmarks: db.prepare(
      'SELECT * FROM local_bookmarks ORDER BY folder_id, position ASC'
    ),
    getByFolder: db.prepare(
      'SELECT * FROM local_bookmarks WHERE folder_id = ? ORDER BY position ASC'
    ),
    getRootBookmarks: db.prepare(
      'SELECT * FROM local_bookmarks WHERE folder_id IS NULL ORDER BY position ASC'
    ),
    updateBookmark: db.prepare(`
      UPDATE local_bookmarks
      SET url = COALESCE(?, url),
          title = COALESCE(?, title),
          favicon_url = COALESCE(?, favicon_url),
          folder_id = ?,
          position = COALESCE(?, position),
          updated_at = datetime('now')
      WHERE id = ?
    `),
    deleteBookmark: db.prepare(
      'DELETE FROM local_bookmarks WHERE id = ?'
    ),
    getBookmarkById: db.prepare(
      'SELECT * FROM local_bookmarks WHERE id = ?'
    ),
    moveBookmark: db.prepare(`
      UPDATE local_bookmarks
      SET folder_id = ?, position = ?, updated_at = datetime('now')
      WHERE id = ?
    `),
    getMaxPosition: db.prepare(`
      SELECT MAX(position) as maxPos FROM local_bookmarks WHERE folder_id IS ?
    `),

    /* Folders */
    insertFolder: db.prepare(`
      INSERT INTO local_bookmark_folders (name, parent_id, position, created_at)
      VALUES (?, ?, ?, datetime('now'))
    `),
    getAllFolders: db.prepare(
      'SELECT * FROM local_bookmark_folders ORDER BY parent_id, position ASC'
    ),
    getFolderById: db.prepare(
      'SELECT * FROM local_bookmark_folders WHERE id = ?'
    ),
    updateFolder: db.prepare(`
      UPDATE local_bookmark_folders SET name = ?, parent_id = ?, position = ? WHERE id = ?
    `),
    deleteFolder: db.prepare(
      'DELETE FROM local_bookmark_folders WHERE id = ?'
    ),
    getMaxFolderPosition: db.prepare(`
      SELECT MAX(position) as maxPos FROM local_bookmark_folders WHERE parent_id IS ?
    `),
  };

  return stmts;
}

/**
 * Add a bookmark.
 * @param {string} url
 * @param {string} title
 * @param {number|null} [folderId=null]
 * @param {number} [position] - Auto-calculated if not provided
 * @param {string} [faviconUrl=null]
 * @returns {object} The created bookmark
 */
function add(url, title, folderId = null, position = undefined, faviconUrl = null) {
  const s = prepareStatements();

  if (position === undefined) {
    const result = s.getMaxPosition.get(folderId);
    position = (result?.maxPos ?? -1) + 1;
  }

  const info = s.insertBookmark.run(url, title, faviconUrl, folderId, position);
  return s.getBookmarkById.get(info.lastInsertRowid);
}

/**
 * Get all bookmarks and folders as a tree structure.
 * @returns {{ bookmarks: Array, folders: Array, tree: Array }}
 */
function getAll() {
  const s = prepareStatements();
  const bookmarks = s.getAllBookmarks.all();
  const folders = s.getAllFolders.all();

  /* Build tree structure */
  const folderMap = new Map();
  for (const folder of folders) {
    folderMap.set(folder.id, { ...folder, children: [], bookmarks: [] });
  }

  /* Assign bookmarks to folders */
  const rootBookmarks = [];
  for (const bm of bookmarks) {
    if (bm.folder_id && folderMap.has(bm.folder_id)) {
      folderMap.get(bm.folder_id).bookmarks.push(bm);
    } else {
      rootBookmarks.push(bm);
    }
  }

  /* Build folder tree */
  const rootFolders = [];
  for (const folder of folderMap.values()) {
    if (folder.parent_id && folderMap.has(folder.parent_id)) {
      folderMap.get(folder.parent_id).children.push(folder);
    } else {
      rootFolders.push(folder);
    }
  }

  return {
    bookmarks,
    folders,
    tree: [...rootFolders, ...rootBookmarks.map(bm => ({ ...bm, _type: 'bookmark' }))],
  };
}

/**
 * Get bookmarks in a specific folder.
 * @param {number} folderId
 * @returns {Array<object>}
 */
function getByFolder(folderId) {
  const s = prepareStatements();
  return s.getByFolder.all(folderId);
}

/**
 * Update a bookmark.
 * @param {number} id
 * @param {object} fields - Fields to update
 * @returns {object|undefined} Updated bookmark
 */
function update(id, fields) {
  const s = prepareStatements();
  s.updateBookmark.run(
    fields.url || null,
    fields.title || null,
    fields.faviconUrl !== undefined ? fields.faviconUrl : null,
    fields.folderId !== undefined ? fields.folderId : null,
    fields.position !== undefined ? fields.position : null,
    id
  );
  return s.getBookmarkById.get(id);
}

/**
 * Delete a bookmark by ID.
 * @param {number} id
 * @returns {boolean}
 */
function deleteBookmark(id) {
  const s = prepareStatements();
  const result = s.deleteBookmark.run(id);
  return result.changes > 0;
}

/**
 * Add a folder.
 * @param {string} name
 * @param {number|null} [parentId=null]
 * @param {number} [position]
 * @returns {object} The created folder
 */
function addFolder(name, parentId = null, position = undefined) {
  const s = prepareStatements();

  if (position === undefined) {
    const result = s.getMaxFolderPosition.get(parentId);
    position = (result?.maxPos ?? -1) + 1;
  }

  const info = s.insertFolder.run(name, parentId, position);
  return s.getFolderById.get(info.lastInsertRowid);
}

/**
 * Move a bookmark to a different folder and/or position.
 * @param {number} id - Bookmark ID
 * @param {number|null} newFolderId
 * @param {number} newPosition
 * @returns {object|undefined}
 */
function moveBookmark(id, newFolderId, newPosition) {
  const s = prepareStatements();
  s.moveBookmark.run(newFolderId, newPosition, id);
  return s.getBookmarkById.get(id);
}

module.exports = {
  add,
  getAll,
  getByFolder,
  update,
  delete: deleteBookmark,
  addFolder,
  moveBookmark,
};
