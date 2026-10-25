import { useEffect, useState } from "react";

export default function PathForm({ projectPath, loading, onScan }) {
  const [value, setValue] = useState(projectPath || "");

  useEffect(() => {
    setValue(projectPath || "");
  }, [projectPath]);

  function submit(event) {
    event.preventDefault();
    onScan(value);
  }

  return (
    <form className="path-form" onSubmit={submit}>
      <label className="path-label" htmlFor="project-path">
        Path proyek lokal
      </label>
      <div className="path-row">
        <input
          id="project-path"
          className="path-input"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="/home/user/proyek"
          spellCheck={false}
          autoComplete="off"
        />
        <button className="primary" type="submit" disabled={loading}>
          {loading ? "Memindai…" : "Scan Proyek"}
        </button>
      </div>
    </form>
  );
}
