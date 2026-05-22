import useSWR from "swr";

export const useLiveData = <T,>(
  key: string | null,
  refreshInterval = 15000,
) => {
  return useSWR<T>(key, {
    refreshInterval: key ? refreshInterval : 0,
    revalidateOnFocus: false,
    dedupingInterval: 5000,
    keepPreviousData: true,
  });
};

export const useRiskData = <T,>(key: string | null) => {
  return useSWR<T>(key, {
    refreshInterval: 5000,
    revalidateOnFocus: false,
    keepPreviousData: true,
  });
};

export const useTableData = <T,>(key: string | null) => {
  return useSWR<{ data: T[]; total: number; totalPages: number }>(key, {
    refreshInterval: 20000,
    revalidateOnFocus: false,
    keepPreviousData: true,
  });
};
