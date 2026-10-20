import { useEffect, useState } from "react";
import { api, type InspectionRecord, type Status } from "../api/client";
import { InspectionTable, STATUS_LABEL } from "./Analytics";

type Filter = "ALL" | Status;

export function InspectionsPage() {
  const [records, setRecords] = useState<InspectionRecord[]>([]);
  const [filter, setFilter] = useState<Filter>("ALL");

  useEffect(() => {
    let alive = true;
    const load = () => api.inspections(500).then((r) => alive && setRecords(r)).catch(() => {});
    load();
    const id = setInterval(load, 2000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const shown = filter === "ALL" ? records : records.filter((r) => r.status === filter);
  const count = (f: Filter) => (f === "ALL" ? records.length : records.filter((r) => r.status === f).length);

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Inspections</h1>
          <p className="page-sub">Every decision in the current session, newest first. Stored in SQLite.</p>
        </div>
      </header>
      <section className="card fill">
        <div className="card-header">
          <div className="tabs">
            {(["ALL", "PASS", "REVIEW", "REJECT"] as Filter[]).map((f) => (
              <button key={f} className={filter === f ? "active" : ""} onClick={() => setFilter(f)}>
                {f === "ALL" ? "All" : STATUS_LABEL[f]} <span className="count">{count(f)}</span>
              </button>
            ))}
          </div>
        </div>
        <InspectionTable records={shown} showModel />
      </section>
    </>
  );
}
