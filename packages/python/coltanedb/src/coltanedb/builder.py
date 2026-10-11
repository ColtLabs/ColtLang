"""
ColtaneDB Query and Schema Builder Module
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Provides fluent, type-safe Python builders for constructing Colt query
and collection definition statements programmatically.
"""

from __future__ import annotations

from typing import List, Optional


class QueryBuilder:
    """Fluent Python builder for constructing Colt `FIND` query statements.

    Example:
        >>> from coltanedb import query
        >>> q = query("books").select("id", "title").where("views > 10").limit(5)
        >>> print(q.to_colt())
        FIND books SELECT id, title
        WHERE views > 10
        LIMIT 5
    """

    def __init__(self, collection_name: str) -> None:
        """Initialize QueryBuilder for the target collection.

        Parameters:
            collection_name (str): The name of the collection to query.
        """
        self._collection = collection_name
        self._selections: List[str] = []
        self._where_clause: Optional[str] = None
        self._order_by: Optional[str] = None
        self._limit: Optional[int] = None
        self._offset: Optional[int] = None

    def select(self, *fields: str) -> QueryBuilder:
        """Specify field projections to return from the collection.

        Parameters:
            *fields (str): Field names or nested document paths (e.g., 'title', 'meta.edition').

        Returns:
            QueryBuilder: The builder instance for method chaining.
        """
        self._selections.extend(fields)
        return self

    def where(self, condition: str) -> QueryBuilder:
        """Specify the filter expression for the `WHERE` clause.

        Parameters:
            condition (str): Boolean filter expression (e.g., 'views > 10 AND published == true').

        Returns:
            QueryBuilder: The builder instance for method chaining.
        """
        self._where_clause = condition
        return self

    def order_by(self, field: str, desc: bool = False) -> QueryBuilder:
        """Specify ordering for the query results.

        Parameters:
            field (str): Field name or document path to sort by.
            desc (bool): If True, sort DESC; otherwise sort ASC. Defaults to False.

        Returns:
            QueryBuilder: The builder instance for method chaining.
        """
        direction = "DESC" if desc else "ASC"
        self._order_by = f"{field} {direction}"
        return self

    def limit(self, count: int) -> QueryBuilder:
        """Set the maximum number of records to return.

        Parameters:
            count (int): Maximum records limit.

        Returns:
            QueryBuilder: The builder instance for method chaining.
        """
        self._limit = count
        return self

    def offset(self, count: int) -> QueryBuilder:
        """Set the number of records to skip.

        Parameters:
            count (int): Offset skip count.

        Returns:
            QueryBuilder: The builder instance for method chaining.
        """
        self._offset = count
        return self

    def to_colt(self) -> str:
        """Serialize the builder into a valid Colt query string.

        Returns:
            str: The generated Colt `FIND` query text.
        """
        select_part = f" SELECT {', '.join(self._selections)}" if self._selections else ""
        colt_str = f"FIND {self._collection}{select_part}"
        if self._where_clause:
            colt_str += f"\nWHERE {self._where_clause}"
        if self._order_by:
            colt_str += f"\nORDER BY {self._order_by}"
        if self._limit is not None:
            colt_str += f"\nLIMIT {self._limit}"
        if self._offset is not None:
            colt_str += f"\nOFFSET {self._offset}"
        return colt_str

    def __str__(self) -> str:
        return self.to_colt()


class CollectionBuilder:
    """Fluent Python builder for constructing Colt `DEFINE COLLECTION` statements.

    Example:
        >>> from coltanedb import collection
        >>> c = (
        ...     collection("books", backend="main")
        ...     .field("id", "uuid", "@key")
        ...     .field("title", "text")
        ...     .field("views", "int", "@default(0)")
        ... )
        >>> print(c.to_colt())
    """

    def __init__(self, name: str, backend: str = "main", strict: bool = True) -> None:
        """Initialize CollectionBuilder.

        Parameters:
            name (str): Name of the collection.
            backend (str): Target connection alias (e.g., 'main', 'cache', 'notes').
            strict (bool): Whether to enforce STRICT schema mode. Defaults to True.
        """
        self._name = name
        self._backend = backend
        self._strict = strict
        self._fields: List[str] = []

    def field(self, name: str, field_type: str, *annotations: str) -> CollectionBuilder:
        """Add a field definition with optional annotations to the collection.

        Parameters:
            name (str): Field identifier.
            field_type (str): Logical type (e.g., 'uuid', 'text', 'int', 'link<authors>', 'vector(1536)').
            *annotations (str): Optional annotations (e.g., '@key', '@unique', '@default(0)').

        Returns:
            CollectionBuilder: The builder instance for method chaining.
        """
        ann_str = f" {' '.join(annotations)}" if annotations else ""
        self._fields.append(f"  {name}: {field_type}{ann_str}")
        return self

    def to_colt(self) -> str:
        """Serialize the builder into a valid Colt `DEFINE COLLECTION` declaration.

        Returns:
            str: The generated Colt collection declaration.
        """
        strict_str = " STRICT" if self._strict else ""
        backend_str = f" @backend({self._backend})" if self._backend else ""
        fields_str = ",\n".join(self._fields)
        return f"DEFINE COLLECTION {self._name}{strict_str}{backend_str} {{\n{fields_str}\n}}"

    def __str__(self) -> str:
        return self.to_colt()


def query(collection_name: str) -> QueryBuilder:
    """Initialize a new fluent Colt `FIND` query builder for the specified collection.

    Parameters:
        collection_name (str): The name of the collection to query.

    Returns:
        QueryBuilder: A new QueryBuilder instance.

    Example:
        >>> from coltanedb import query
        >>> q = query("users").select("id", "email").where("active == true")
    """
    return QueryBuilder(collection_name)


def collection(name: str, backend: str = "main", strict: bool = True) -> CollectionBuilder:
    """Initialize a new fluent Colt `DEFINE COLLECTION` schema builder.

    Parameters:
        name (str): The name of the collection.
        backend (str): Target connection alias. Defaults to 'main'.
        strict (bool): Enforce strict schema mode. Defaults to True.

    Returns:
        CollectionBuilder: A new CollectionBuilder instance.

    Example:
        >>> from coltanedb import collection
        >>> schema = collection("users").field("id", "uuid", "@key").field("email", "text", "@unique")
    """
    return CollectionBuilder(name, backend, strict)
