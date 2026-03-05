import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/auth";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export interface CustomerData {
    id: number;
    name: string;
    doc?: string | null;
    phone?: string | null;
    email?: string | null;
}

interface CustomerAutocompleteProps {
    value: string;
    onChange: (value: string, customer?: CustomerData) => void;
    placeholder?: string;
}

export function CustomerAutocomplete({ value, onChange, placeholder = "Ingrese nombre cliente..." }: CustomerAutocompleteProps) {
    const [query, setQuery] = useState(value);
    const [results, setResults] = useState<CustomerData[]>([]);
    const [open, setOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Update internal query if value prop changes externally (e.g. form reset)
    useEffect(() => {
        setQuery(value);
    }, [value]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        const debouncedSearch = setTimeout(async () => {
            const tr = query.trim();
            if (!tr) {
                setResults([]);
                return;
            }

            // If the query exactly matches what was passed in (meaning we selected it or it reset),
            // we don't necessarily want to pop it open unless the user is actively typing. 
            // But we will fetch just in case.
            try {
                const res = await apiRequest("GET", `/api/customers?q=${encodeURIComponent(tr)}&pageSize=10`);
                const json = await res.json();
                setResults(json.data || []);
            } catch {
                setResults([]);
            }
        }, 300);

        return () => clearTimeout(debouncedSearch);
    }, [query]);

    const handleSelect = (c: CustomerData) => {
        setQuery(c.name);
        setOpen(false);
        onChange(c.name, c);
    };

    const handleInputChange = (v: string) => {
        setQuery(v);
        setOpen(true);
        onChange(v); // It triggers a simple string change
    };

    return (
        <div className="relative" ref={wrapperRef}>
            <Input
                value={query}
                placeholder={placeholder}
                onChange={(e) => handleInputChange(e.target.value)}
                onFocus={() => { if (query.trim().length > 0) setOpen(true); }}
                data-testid="input-customer-name-auto"
            />
            {open && results.length > 0 && (
                <div className="absolute z-50 w-full top-full mt-1 bg-card border rounded-md shadow-lg max-h-48 overflow-auto">
                    {results.map((c) => (
                        <button
                            key={c.id}
                            type="button"
                            className="w-full text-left px-3 py-2 hover:bg-muted/50 text-sm border-b last:border-b-0"
                            onClick={() => handleSelect(c)}
                        >
                            <div className="flex flex-col">
                                <span className="font-medium text-foreground">{c.name}</span>
                                <span className="text-xs text-muted-foreground">
                                    {c.phone ? `Tel: ${c.phone}` : "Sin teléfono"} {c.email ? ` | ${c.email}` : ""}
                                </span>
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
