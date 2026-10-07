import React from "react";
import { Icon } from "@nexusmods/vortex-api";
import { pageNumbers } from "./browse-model";

export interface PaginationProps {
  page: number;
  pageCount: number;
  jumpValue: string;
  setPage: (value: number) => void;
  setJumpValue: (value: string) => void;
}

export function Pagination({ page, pageCount, jumpValue, setPage, setJumpValue }: PaginationProps): React.ReactElement | null {
  if (pageCount <= 1) return null;
  return (
    <nav className="nxm-pagination" aria-label="Pagination navigation">
      <div className="nxm-pagination-items">
        <button
          type="button"
          aria-label="Go to previous page"
          title="Previous page"
          disabled={page === 1}
          className="nxm-pagination-arrow"
          onClick={() => setPage(Math.max(1, page - 1))}
        ><Icon name="collection-previous" className="size-4" /></button>
        {pageNumbers(page, pageCount).map((value, index) => value === "ellipsis"
          ? <span key={`ellipsis-${index}`} className="nxm-pagination-separator">...</span>
          : <button
            key={value}
            type="button"
            aria-current={value === page ? "true" : "false"}
            aria-label={`Go to page ${value}`}
            className={`nxm-pagination-number ${value === page ? "nxm-pagination-number-active" : ""}`}
            onClick={() => setPage(value)}
          >{value}</button>)}
        <button
          type="button"
          aria-label="Go to next page"
          title="Next page"
          disabled={page === pageCount}
          className="nxm-pagination-arrow"
          onClick={() => setPage(Math.min(pageCount, page + 1))}
        ><Icon name="collection-next" className="size-4" /></button>
      </div>
      {pageCount >= 7 ? (
        <form
          className="nxm-pagination-page"
          aria-label="Jump to page"
          onSubmit={(event) => {
            event.preventDefault();
            const requested = Number.parseInt(jumpValue, 10);
            if (Number.isInteger(requested) && requested >= 1 && requested <= pageCount) setPage(requested);
            else setJumpValue(String(page));
          }}
        >
          <label htmlFor="thunderstore-page-jump" className="nxm-pagination-page-label">Page</label>
          <input
            id="thunderstore-page-jump"
            type="number"
            min={1}
            max={pageCount}
            value={jumpValue}
            aria-label="Jump to page"
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => setJumpValue(event.target.value)}
            className="nxm-input nxm-pagination-page-input"
          />
          <button type="submit" className="nxm-button nxm-button-neutral nxm-button-moderate">Go</button>
        </form>
      ) : null}
    </nav>
  );
}
