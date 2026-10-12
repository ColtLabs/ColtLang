; ColtLang Syntax Highlighting Query for Tree-sitter
; Compatible with GitHub Linguist, Helix, Neovim, and Zed

; Keywords
[
  "CONNECT"
  "AS"
  "DEFAULT"
  "CONNECTION"
  "DEFINE"
  "COLLECTION"
  "MELD"
  "STRICT"
  "FLEXIBLE"
  "LINK"
  "SYNC"
  "CONSTRAINT"
  "FIND"
  "SELECT"
  "WHERE"
  "ORDER"
  "BY"
  "LIMIT"
  "OFFSET"
  "PUT"
  "CREATE"
  "DELETE"
  "ATOMIC"
  "AND"
  "OR"
  "NOT"
  "ASC"
  "DESC"
  "NULLS"
  "FIRST"
  "LAST"
  "VECTORIZE"
  "STREAM"
  "MASK"
  "REDACT"
  "EXPIRE"
  "CASCADE"
  "RESOLVE"
  "FALLBACK"
] @keyword

; Builtin Types
(primitive_type) @type.builtin
(link_type "link" @type.builtin)
(list_type "list" @type.builtin)
(vector_type "vector" @type.builtin)

; Engine Targets
(engine_name) @type

; Annotations & Decorators
(annotation "@" @punctuation.special (identifier) @attribute)

; Function Calls
(call_expression
  function: (identifier) @function.call)

; Field & Property Definitions
(field_definition
  name: (identifier) @property)

(object_field
  key: (identifier) @property)

; Parameters ($param)
(parameter) @variable.parameter

; Literals
(string_literal) @string
(integer_literal) @number
(float_literal) @number
(boolean_literal) @boolean
(null_literal) @constant.builtin
(duration_literal) @number
(time_literal) @string.special
(uuid_literal) @string.special

; Comments
(comment) @comment

; Punctuation
["{" "}" "[" "]" "(" ")" "<" ">"] @punctuation.bracket
["," ":" "." ";"] @punctuation.delimiter
["=" "==" "!=" "<" "<=" ">" ">=" "+" "-" "*" "/" "%" "!"] @operator
