# Protocol Buffers

**Protobuf definitions** for service communication.

## Structure

```
proto/
├── buf.yaml          # Buf configuration
├── buf.gen.yaml      # Code generation config
└── ferni/
    └── tools/        # Tool-related proto definitions
```

## Purpose

Protocol Buffer definitions for:
- Service-to-service communication
- Tool definitions
- Typed message schemas

## Using Buf

Buf is used for protobuf management and code generation.

```bash
# Install buf
brew install bufbuild/buf/buf

# Lint protos
buf lint

# Generate code
buf generate

# Check breaking changes
buf breaking --against '.git#branch=main'
```

## Configuration

### buf.yaml
Module configuration and lint rules.

### buf.gen.yaml
Code generation plugins and output paths.

## Adding New Protos

1. Create `.proto` file in appropriate directory under `ferni/`
2. Run `buf lint` to validate
3. Run `buf generate` to create TypeScript/Go code
4. Import generated code in your service

## Generated Output

Generated code typically goes to:
- `src/generated/` - TypeScript definitions
- Language-specific output directories

## Related

- `src/tools/` - Tool implementations using these protos
- Buf documentation: https://buf.build/docs/
