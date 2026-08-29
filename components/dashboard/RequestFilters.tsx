"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, X } from "lucide-react";

export function RequestFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const status = searchParams.get("status") ?? "";

  function applyFilters(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete("page");
    router.push(`/dashboard/requests?${params.toString()}`);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    applyFilters("search", search.trim());
  }

  function clearSearch() {
    setSearch("");
    applyFilters("search", "");
  }

  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <form onSubmit={handleSearch} className="flex-1 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
        <Input
          placeholder="Search by name, email, or order ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 pr-9 h-10 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 focus-visible:ring-violet-500/20 focus-visible:border-violet-500"
        />
        {search && (
          <button
            type="button"
            onClick={clearSearch}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </form>
      <Select
        value={status}
        onValueChange={(v) => applyFilters("status", v === "all" ? "" : (v ?? ""))}
      >
        <SelectTrigger className="w-full sm:w-[180px] h-10 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 focus:ring-violet-500/20 focus:border-violet-500">
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent className="border-zinc-200 dark:border-zinc-700">
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="pending">Pending</SelectItem>
          <SelectItem value="rated">Rated</SelectItem>
          <SelectItem value="completed">Completed</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
