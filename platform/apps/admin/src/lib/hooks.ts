import useSWR from "swr";

export const useLiveData = <T,>(
  key: string | null,
  refreshInterval = 8000,
) => {
  return useSWR<T>(key, {
    refreshInterval: key ? refreshInterval : 0,
    revalidateOnFocus: true,
    dedupingInterval: 3000,
    keepPreviousData: true,
  });
};

export const useRiskData = <T,>(key: string | null) => {
  return useSWR<T>(key, {
    refreshInterval: 5000,
    revalidateOnFocus: true,
    keepPreviousData: true,
  });
};

export const useTableData = <T,>(key: string | null) => {
  return useSWR<{ data: T[]; total: number; totalPages: number }>(key, {
    refreshInterval: 12000,
    revalidateOnFocus: true,
    keepPreviousData: true,
  });
};
