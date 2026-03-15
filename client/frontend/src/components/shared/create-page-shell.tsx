import { PageContainer } from "./page-container";

interface CreatePageShellProps {
  title: string;
  description: string;
  children: React.ReactNode;
}

export function CreatePageShell({
  title,
  description,
  children,
}: CreatePageShellProps) {
  return (
    <PageContainer>
        <section className="border border-zinc-800 bg-zinc-900/30 p-4 space-y-1">
          <h1 className="text-zinc-100 font-semibold">{title}</h1>
          <p className="text-xs text-zinc-500">{description}</p>
        </section>
        {children}
    </PageContainer>
  );
}
