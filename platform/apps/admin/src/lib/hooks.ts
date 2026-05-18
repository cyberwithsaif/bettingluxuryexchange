import useSWR from "swr";

export const useLiveData = <T,>(
  key: string | null,
  refreshInterval = 5000,
) => {
  return useSWR<T>(
    key,
    undefined,
    {
      refreshInterval: key ? refreshInterval : 0,
      revalidateOnFocus: false,
      dedupingInterval: 2000,
    }
  );
};

export const useRiskData = <T,>(key: string | null) => {
  return useSWR<T>(key, undefined, { refreshInterval: 3000 });
};

export const useTableData = <T,>(key: string | null, pageSize = 25) => {
  return useSWR<{ data: T[]; total: number; totalPages: number }>(
    key,
    undefined,
    { refreshInterval: 8000, revalidateOnFocus: false }
  );
};
