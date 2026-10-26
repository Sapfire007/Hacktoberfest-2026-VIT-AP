/**
 * Faculty Hook
 * 
 * Custom React hook for fetching and managing paginated faculty data
 */

import { useState, useCallback } from 'react';
import { 
  getInitialFaculty, 
  loadMoreFaculty, 
  getCachedFaculty, 
  clearFacultyCache, 
  hasMore, 
  isLoading as isLoadingService,
  searchFacultyInDB,
  FacultyMember 
} from '@/services/faculty.service';

interface UsePaginatedFacultyReturn {
  faculty: FacultyMember[];
  loading: boolean;
  loadingMore: boolean;
  searchLoading: boolean;
  error: Error | null;
  hasMore: boolean;
  loadInitial: () => Promise<void>;
  loadMore: () => Promise<void>;
  search: (query: string) => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * Hook for paginated faculty loading with DB search
 * 
 * @example
 * const { faculty, loading, loadMore, search, hasMore } = usePaginatedFaculty();
 */
export function usePaginatedFaculty(): UsePaginatedFacultyReturn {
  const [faculty, setFaculty] = useState<FacultyMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasMoreData, setHasMoreData] = useState(true);

  const loadInitial = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const data = await getInitialFaculty();
      setFaculty(data);
      setHasMoreData(hasMore());
    } catch (err) {
      console.error('Error loading initial faculty:', err);
      setError(err instanceof Error ? err : new Error('Failed to load faculty'));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!hasMore() || isLoadingService()) {
      return;
    }

    try {
      setLoadingMore(true);
      
      const data = await loadMoreFaculty();
      setFaculty(data);
      setHasMoreData(hasMore());
    } catch (err) {
      console.error('Error loading more faculty:', err);
      setError(err instanceof Error ? err : new Error('Failed to load more faculty'));
    } finally {
      setLoadingMore(false);
    }
  }, []);

  const search = useCallback(async (query: string) => {
    if (!query || query.trim().length < 2) {
      // If no search query, restore cached paginated data
      const cached = getCachedFaculty();
      if (cached.length > 0) {
        setFaculty(cached);
        setHasMoreData(hasMore()); // Re-enable pagination
      }
      return;
    }

    try {
      setSearchLoading(true);
      setError(null);
      
      const results = await searchFacultyInDB(query);
      setFaculty(results);
      setHasMoreData(false); // Disable pagination during search
    } catch (err) {
      console.error('Error searching faculty:', err);
      setError(err instanceof Error ? err : new Error('Failed to search faculty'));
    } finally {
      setSearchLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    clearFacultyCache();
    await loadInitial();
  }, [loadInitial]);

  return { 
    faculty, 
    loading, 
    loadingMore,
    searchLoading,
    error, 
    hasMore: hasMoreData,
    loadInitial, 
    loadMore,
    search, 
    refresh 
  };
}