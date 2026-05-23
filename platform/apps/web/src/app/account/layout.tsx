export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[1600px] px-3 py-5">
      {children}
    </div>
  );
}
