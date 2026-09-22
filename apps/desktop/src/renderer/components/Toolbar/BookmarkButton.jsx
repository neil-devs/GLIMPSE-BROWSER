import React from 'react';
import useTabs from '../../hooks/useTabs';
import useBookmarks from '../../hooks/useBookmarks';

export default function BookmarkButton() {
  const { activeTab } = useTabs();
  const { isBookmarked, addBookmark, removeBookmark, getBookmarkByUrl } = useBookmarks();

  const bookmarked = activeTab ? isBookmarked(activeTab.url) : false;

  const handleClick = async () => {
    if (!activeTab || activeTab.url === 'about:blank') return;

    if (bookmarked) {
      const bm = getBookmarkByUrl(activeTab.url);
      if (bm) await removeBookmark(bm.id);
    } else {
      await addBookmark(activeTab.url, activeTab.title || activeTab.url);
    }
  };

  return (
    <button
      className={`btn-icon ${bookmarked ? 'active' : ''}`}
      onClick={handleClick}
      title={bookmarked ? 'Remove bookmark' : 'Bookmark this page'}
      aria-label={bookmarked ? 'Remove bookmark' : 'Add bookmark'}
    >
      {bookmarked ? '★' : '☆'}
    </button>
  );
}
