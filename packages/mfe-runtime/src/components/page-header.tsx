export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1">
        <h1 className="font-heading text-[26px] font-extrabold leading-tight tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

/** Aviso cuando una pantalla no pudo cargar datos: dice qué pasó y cómo revisarlo. */
export function LoadError({ error }: { error: Error }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
    >
      <p className="font-semibold">No se pudieron cargar los datos</p>
      <p className="mt-1">{error.message}</p>
      <p className="mt-2 text-xs text-muted-foreground">
        Revisa la conexión con el botón «Conectar» de la barra superior.
      </p>
    </div>
  );
}
