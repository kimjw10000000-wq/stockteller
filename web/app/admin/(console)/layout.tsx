import { AdminNav } from "@/components/admin/AdminNav";

export default function AdminConsoleLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="py-8">
      <AdminNav />
      {children}
    </div>
  );
}
