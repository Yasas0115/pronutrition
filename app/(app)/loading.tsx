// Shown inside the shared shell while the next page's data loads, so the
// sidebar and header stay put and only the content area shows a skeleton.
export default function Loading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-live="polite">
      <div className="skel" style={{ height: 34, width: 240 }} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skel" style={{ height: 88 }} />
        ))}
      </div>
      <div className="skel" style={{ height: 320 }} />
    </div>
  );
}
