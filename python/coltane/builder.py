from __future__ import annotations
from typing import List, Optional, Union


class QueryBuilder:
    """Fluent Python builder for constructing Colt queries."""

    def __init__(self, collection_name: str):
        self._collection = collection_name
        self._selections: List[str] = []
        self._where_clause: Optional[str] = None
        self._order_by: Optional[str] = None
        self._limit: Optional[int] = None
        self._offset: Optional[int] = None

    def select(self, *fields: str) -> QueryBuilder:
        self._selections.extend(fields)
        return self

    def where(self, condition: str) -> QueryBuilder:
        self._where_clause = condition
        return self

    def order_by(self, field: str, desc: bool = False) -> QueryBuilder:
        direction = "DESC" if desc else "ASC"
        self._order_by = f"{field} {direction}"
        return self

    def limit(self, count: int) -> QueryBuilder:
        self._limit = count
        return self

    def offset(self, count: int) -> QueryBuilder:
        self._offset = count
        return self

    def to_colt(self) -> str:
        """Serializes builder into Colt language string."""
        select_part = f" SELECT {', '.join(self._selections)}" if self._selections else ""
        query = f"FIND {self._collection}{select_part}"
        if self._where_clause:
            query += f"\nWHERE {self._where_clause}"
        if self._order_by:
            query += f"\nORDER BY {self._order_by}"
        if self._limit is not None:
            query += f"\nLIMIT {self._limit}"
        if self._offset is not None:
            query += f"\nOFFSET {self._offset}"
        return query

    def __str__(self) -> str:
        return self.to_colt()


class CollectionBuilder:
    """Fluent builder for DEFINE COLLECTION statements."""

    def __init__(self, name: str, backend: str = "neon", strict: bool = True):
        self._name = name
        self._backend = backend
        self._strict = strict
        self._fields: List[str] = []

    def field(self, name: str, field_type: str, *annotations: str) -> CollectionBuilder:
        ann_str = f" {' '.join(annotations)}" if annotations else ""
        self._fields.append(f"  {name}: {field_type}{ann_str}")
        return self

    def to_colt(self) -> str:
        strict_str = " STRICT" if self._strict else ""
        fields_str = ",\n".join(self._fields)
        return f"DEFINE COLLECTION {self._name}{strict_str} @backend({self._backend}) {{\n{fields_str}\n}}"

    def __str__(self) -> str:
        return self.to_colt()


def query(collection_name: str) -> QueryBuilder:
    """Create a new Colt query builder for the given collection."""
    return QueryBuilder(collection_name)


def collection(name: str, backend: str = "neon", strict: bool = True) -> CollectionBuilder:
    """Create a new Colt collection schema builder."""
    return CollectionBuilder(name, backend, strict)
