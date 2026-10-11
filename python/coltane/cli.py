import sys
import argparse
from .client import Client


def main():
    parser = argparse.ArgumentParser(description="ColtaneDB / ColtLang Python CLI")
    parser.add_argument("command", choices=["plan", "parse", "check"], help="Command to run")
    parser.add_argument("file", help="Path to .colt file or '-' for stdin")
    parser.add_argument("--url", default="http://localhost:3000", help="ColtaneDB server URL")

    args = parser.parse_args()

    if args.file == "-":
        source = sys.stdin.read()
    else:
        with open(args.file, "r", encoding="utf-8") as f:
            source = f.read()

    client = Client(args.url)

    if args.command in ("plan", "check"):
        result = client.plan(source)
        if result.diagnostics:
            for d in result.diagnostics:
                print(f"[{d.code}] {d.message} (span: {d.span})", file=sys.stderr)
            sys.exit(1)
        for i, step in enumerate(result.steps, 1):
            print(f"--- Step {i} ({step.operation}) ---")
            print(step.parameterized_statement)
            if step.params:
                print(f"Params: {step.params}")
    elif args.command == "parse":
        res = client.parse(source)
        import pprint
        pprint.pprint(res.ast)


if __name__ == "__main__":
    main()
