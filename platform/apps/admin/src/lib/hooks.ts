import useSWR from "swr";

export const useLiveData = <T,>(
  key: string | null,
  refreshInterval = 5000,
) => {
  return useSWR<T>(key, {
    refreshInterval: key ? refreshInterval : 0,
    revalidateOnFocus: false,
    dedupingInterval: 2000,
  });
};

export const useRiskData = <T,>(key: string | null) => {
  return useSWR<T>(key, { refreshInterval: 3000, revalidateOnFocus: false });
};

export const useTableData = <T,>(key: string | null) => {
  return useSWR<{ data: T[]; total: number; totalPages: number }>(key, {
    refreshInterval: 8000,
    revalidateOnFocus: false,
  });
};
