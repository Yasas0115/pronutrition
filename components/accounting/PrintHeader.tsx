// The store name + what this report is, shown only on paper (print-only).
export default function PrintHeader({ storeName, line }: { storeName: string; line: string }) {
  return (
    <div className="print-only mb-4">
      <div className="brand" style={{ fontSize: 26 }}>{storeName}</div>
      <div style={{ fontSize: 13 }}>{line}</div>
      <hr style={{ margin: '10px 0' }} />
    </div>
  );
}
