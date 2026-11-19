# Changelog

All notable changes to `@tronweb3/tviem` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0-rc.1]

Release candidate for 1.0.0. Changes are relative to `1.0.0-beta.1`. This release contains breaking changes, each listed with its migration steps under Breaking Changes.

### Breaking Changes

#### Accounts and signing

- A string `account` is now always a Base58Check address and resolves to an address-only `JsonRpcAccount`, as in viem. This applies to the `account` option of `createClient` / `createWalletClient`, to the `account` parameter of every action, and to `parseAccount` / `ParseAccount`. Any other string, including a private key, throws `InvalidAddressError`. The `AccountKey` type is removed, and `TronAccount` now also includes `JsonRpcAccount`.
  ```ts
  createWalletClient({ account: '0x<key>', transport })     // before
  createWalletClient({ account: privateKeyToAccount('0x<key>'), transport })
  sendTrx(client, { account: '<key>', to, amount })         // before (same for every write, build and sign action)
  sendTrx(client, { account: privateKeyToAccount('<key>'), to, amount })
  multiSign(client, { account: '<key>', transaction })      // before
  multiSign(client, { privateKey: '<key>', transaction })   // or account: privateKeyToAccount('<key>')
  parseAccount('<key>')                                     // before
  privateKeyToAccount('<key>')
  ```
  `parseAccount('T…')` now returns `{ address, type: 'json-rpc' }`. Replace `AccountKey` with `Address` for account strings, or `Hex` for keys. Before you call the signing methods of a `TronAccount`, narrow it with `account.type === 'local'`.
- `toAccount('T…')` now returns an address-only `JsonRpcAccount`, and it no longer accepts private keys. A custom source must implement `signMessage`, `signTypedData` and `signTransaction` as functions, otherwise `toAccount` throws `InvalidParameterError`. Change `toAccount('0x<key>')` to `privateKeyToAccount('0x<key>')`.
- Account signing methods (`signMessage`, `signTypedData` and `signTransaction` on `TronCustomSource`, and `AccountMultiSignFn`) now return `MaybePromise<…>`, as in viem. Custom sources can therefore sign asynchronously, and every sign and write action awaits them. Change `account.signTransaction(tx)` to `await account.signTransaction(tx)`, and do the same for `signMessage`, `signTypedData` and `multiSign` on accounts from `privateKeyToAccount`, `mnemonicToAccount`, `hdKeyToAccount` and `toAccount`.
- `signMessage` and `signTypedData` (the `@tronweb3/tviem/accounts` utilities, the account methods and the actions) now return the `0x`-prefixed 65-byte signature as `Hex`, as viem, TronWeb and TronLink do. `SignMessageReturnType` and `SignTypedDataReturnType` are now `Hex`. The `Signature` type is now `{ r, s, v, yParity }`, without the `recovery`, `hex` and `serialized` fields. Migration:
  - `sig.serialized` → `sig`
  - `sig.hex` → `sig.slice(2)`
  - `sig.r` / `sig.s` / `sig.v` → `parseSignature(sig).r` / `.s` / `.v`
  - `sig.recovery` → `parseSignature(sig).yParity`

  The `signMessage` and `signTypedData` methods of a custom source now return the hex signature, for example `serializeSignature({ r, s, v })`.
- The `signTransaction` utility in `@tronweb3/tviem/accounts` no longer takes `address`. It always checks the transaction's `owner_address` against the address of the signing key. Change `signTransaction({ transaction, privateKey, address })` to `signTransaction({ transaction, privateKey })`. To co-sign with a key that is not the owner, use `multiSignTransaction({ transaction, privateKey, permissionId })`, the account's `multiSign`, or the `multiSign` action.
- The `signMessage` and `signTypedData` utilities in `@tronweb3/tviem/accounts` now require a string `extraEntropy` to be `0x`-prefixed hex of whole bytes, and throw `InvalidParameterError` otherwise. For example, change `'0xabc'` to `'0x0abc'` (the same bytes), and give any other entropy string as `0x`-prefixed whole-byte hex. Omit the option instead of passing `'0x'`. `Uint8Array` and boolean values work as before.
- `mnemonicToAccount` now requires `passphrase` to be a string or `undefined`, and throws `InvalidParameterError` otherwise. Change `{ passphrase: 1234 }` to `{ passphrase: '1234' }`, which derives the same account.

#### Actions

- `readContract`, `triggerConstantContract` and `estimateEnergy` take the caller `account` as `TronAccount | Address`. A hex address (`41…`, `0x…`) throws `InvalidAddressError` before any request is sent. Change `account: '41…'` to `account: toBase58('41…')`.
- `broadcastTransaction` now takes `{ transaction }` and `broadcastHex` takes `{ serializedTransaction }`. This applies to both the actions and the wallet client methods, and both throw `InvalidParameterError` when the value is missing. Migration:
  - `broadcastTransaction({ signedTransaction })` → `broadcastTransaction({ transaction })`
  - `broadcastHex({ transaction: hex })` → `broadcastHex({ serializedTransaction: hex })`
- `accountPermissionUpdate` and `buildAccountPermissionUpdate` take the permission name as `permissionName`, matching `getAccount` and `getSignWeight`. A permission that has `permission_name` throws `InvalidParameterError`. Change `{ permission_name: 'owner', … }` to `{ permissionName: 'owner', … }` in `owner`, in `witness` and in each `actives` entry.
- A string `memo` must now be `0x`-prefixed hex. Without the prefix, wallet actions such as `sendTrx`, `sendTrc10`, `writeContract` and `deployContract` throw `InvalidParameterError` before any request is sent. Change `memo: 'cafe'` to `memo: '0xcafe'`, and encode a text memo as `memo: stringToHex('hello')`. `Uint8Array` memos work as before.
- `writeContract`, `buildWriteContract`, `deployContract` and `buildDeployContract` throw `InvalidParameterError` when `feeLimit` is `0n` or less. Omit `feeLimit` to use the default of 150 TRX, or pass a positive amount in SUN.
- `getLogs` / `client.getLogs` throw `InvalidParameterError` when `address` is an empty list. Omit `address` to query every contract, or skip the call.
- With a typed ABI, `callValue`, `callTokenValue` and `tokenId` take a value only when the called function is `payable`. For `deployContract` and `buildDeployContract`, the constructor must be `payable`. Otherwise these options are typed `undefined`. This applies to `writeContract`, `buildWriteContract`, `estimateEnergy`, `deployContract`, `buildDeployContract`, and `getContract`'s `write.<fn>` / `estimateEnergy.<fn>`. For an overloaded function, the overload selected by `args` decides. To migrate, remove these options from calls to non-payable functions, declare the ABI item with `stateMutability: 'payable'`, or type the ABI as `Abi`.
- Removed `getEnergyFee` and `getTransactionFee` from `@tronweb3/tviem` and `@tronweb3/tviem/actions`. Read the values from `const params = await getChainParameters(client)` instead:
  - `getEnergyFee(params)` → `params.getEnergyFee ?? 0n`
  - `getTransactionFee(params)` → `params.getTransactionFee ?? 0n`

#### Transactions and receipts

- `waitForTransactionReceipt` and `client.waitForTransactionReceipt` now resolve to `TransactionInfo`, the type `getTransactionInfo` returns. `TransactionRevertedError.receipt` is also a `TransactionInfo`. The `TransactionReceipt` type is removed: use `TransactionInfo` or `WaitForTransactionReceiptReturnType` instead. Its `id`, `blockNumber` and `status` fields are now required and precisely typed (for example `blockNumber: bigint` and `status: 'success' | 'reverted'`), and there is no index signature. `new TransactionRevertedError({ hash, receipt })` requires a full `TransactionInfo`. `TransactionInfo` also has four new required fields: `originEnergyUsage`, `energyPenaltyTotal`, `packingFee` (all `bigint`) and `internalTransactions`. Add them wherever you build a `TransactionInfo` value yourself, for example in test doubles or in the `receipt` passed to `new TransactionRevertedError`.
- `RawData`, `RawContract` and the contract message types (`TransferContract`, `TriggerSmartContract`, `Permission`, `PermissionKey`, `Vote`, `ProposalParameter`, …) now describe the decoded form. That is the form returned by `decodeRawData`, `decodeContractParameter`, the build actions and the node: addresses are `string`, int64 values are `number | string`, and bytes are bare hex. `RawContract` is a union discriminated by `type`. Fields that protobuf omits at their default value are now optional, for example `UpdateBrokerageContract.brokerage` and proposal `proposal_id`.
  - For values you build, use the new input types: `RawData` → `RawDataInput`, `RawContract` → `RawContractInput`, and each `XxxContract` → `XxxContractInput`. The other renames are `Permission` → `PermissionMessageInput`, `PermissionKey` → `PermissionKeyInput`, `Vote` → `VoteInput`, `ProposalParameter` → `ProposalParameterMessageInput` and `AssetIssueFrozenSupply` → `AssetIssueFrozenSupplyInput`.
  - `serializeRawData`, `toRawDataHex` and `getTransactionId` accept both forms. `fillBlockHeader` takes and returns `RawDataInput`.
  - `SignableTransaction.raw_data` and `txCheck` use the decoded `RawData`.
  - To read a contract, narrow with `contract.type === 'TransferContract'` instead of casting.

#### Errors

- The beta.1 error classes for a block or transaction that does not match the expected one are renamed to `BlockMismatchError` and `TransactionMismatchError`, following viem's `…MismatchError` naming. Their `…ErrorType` types are renamed the same way, and the constructor fields are unchanged. Update imports, `instanceof` checks and `error.name` comparisons.
- Renamed `DecodeLogDataMismatch` → `DecodeLogDataMismatchError`, `DecodeLogTopicsMismatch` → `DecodeLogTopicsMismatchError` and `UnsupportedPackedAbiType` → `UnsupportedPackedAbiTypeError`. `error.name` is the new class name. The `…ErrorType` names stay the same, and the old names have no aliases.
- `ContractFunctionRevertedError`, thrown by `readContract`, `triggerConstantContract` and `estimateEnergy`, now decodes the revert payload against `Error(string)`, `Panic(uint256)` and the ABI's `error` items. It has these fields:
  - `data`: the decoded `{ abiItem, args, errorName }`
  - `raw`: the payload hex
  - `reason`: the `Error(string)` text, a description of the panic code, or the node's message when the node returns no revert payload
  - `signature`: the 4-byte selector, set only when the error is not on the ABI

  `reason` is set from the payload only for the built-in `Error(string)` and `Panic(uint256)`. A custom ABI error with the same name but different inputs is reported as a custom error. The `code` field is removed, and the constructor now takes `{ abi, functionName, data?, message? }`, with `data` as the raw payload. Migration (`formatAbiItem` is exported from `@tronweb3/tviem` and `@tronweb3/tviem/utils`):
  - `err.data` (raw hex) → `err.raw`
  - `err.code` → `err.data?.args?.[0]` when `err.data && formatAbiItem(err.data.abiItem) === 'Panic(uint256)'`
  - `err.signature === 'Error(string)'` / `'Panic(uint256)'` → `err.data && formatAbiItem(err.data.abiItem) === 'Error(string)'` / `'Panic(uint256)'`
- Validation errors that were thrown as a plain `BaseError` are now thrown as named classes, such as `InvalidParameterError`, `MissingFieldError`, `InvalidSignatureError`, `PermissionError` and `TransactionIntegrityError`. The messages are the same. `instanceof BaseError` still matches, but `error.name` is now the class name, and each `…ErrorType` union lists the specific classes. Replace `err.name === 'BaseError'` with a check on the named class (for example `err instanceof InvalidParameterError`) or with `err instanceof BaseError`.
- `BaseError.details` is now typed `string | undefined`. Change `err.details.includes(x)` to `err.details?.includes(x)`.
- Removed `RlpDepthLimitExceededError` and `CallExecutionError`, with their `…ErrorType` types. No API threw them, so you can delete their imports and `instanceof` checks.

#### ABI

- `getAbiItem` now throws `AbiItemAmbiguityError` whenever two overloads that accept `args` have different selectors. This includes overloads that differ only in array length (`T[]` vs `T[k]`), in tuple vs array shape, or in element type when the array argument is empty. Overloads that share a selector still resolve. The same applies to `encodeFunctionData`, `decodeFunctionResult`, `encodeErrorResult` and the contract actions. To fix an ambiguity, pass an `abi` that holds only the intended overload, or select it by selector with `getAbiItem({ abi, name: toFunctionSelector('f(uint256[2])') })`.
- `encodePacked` now throws `InvalidAbiParameterValueError`, as `encodeAbiParameters` does, for these values:
  - a `string` value that is not a string
  - a `bytes` / `bytesN` value that is not hex
  - a `bool` value that is not a boolean
  - an integer or `trcToken` value that is neither a number nor a bigint

  `UnsupportedPackedAbiTypeError` is now thrown only for types that have no packed encoding. Change `encodePacked(['string'], [123])` to `encodePacked(['string'], ['123'])`, and catch value errors as `InvalidAbiParameterValueError`.

#### Units and utilities

- `parseTrx(trx)` and `formatTrx(sun)` no longer take a `unit` argument: `parseTrx(value, 'sun')` → `parseTrx(value)` and `formatTrx(sun, 'sun')` → `formatTrx(sun)`. `parseUnits` and `parseTrx` have three other changes:
  - Fraction digits beyond `decimals` are truncated instead of rounded, so `parseTrx('1.9999999')` now returns `1999999n` (it was `2000000n`). If you need rounding, round the string before the call.
  - A value with no digit (`''`, `'.'`, `'-'`) now throws `InvalidDecimalNumberError`. Pass `'0'` for zero.
  - `decimals` must be a non-negative integer, otherwise `InvalidDecimalsError` is thrown. `formatUnits` checks `decimals` the same way.
- `isAddress(value, { strict: false })` and calls whose `strict` is not known to be `true` now narrow `value` to `AddressInput`. The default strict mode still narrows to `Address`. To get an `Address`, convert with `toBase58(value)` or use the strict check.
- Removed the `bytesToBigint` alias (use `bytesToBigInt`), and removed `contractCodecs`, `getContractCodecByType`, `getContractCodecByTypeUrl`, the `ContractCodec` type and `int64ToJson` from `@tronweb3/tviem` and `@tronweb3/tviem/utils`. Use `decodeContractParameter`, `decodeRawData`, `serializeRawData` and `contractTypeNameOf` instead.

#### Types

- With a literal (`as const`) ABI, `getLogs`, `client.getLogs`, `getContract().getEvents.<Event>()` and `decodeEventLog` now infer `eventName` and `args` from the ABI's events, and `strict: true` types every argument as present. The `args` filter is typed from the event's indexed inputs, and the `eventName` passed to `decodeEventLog` must name an event in the ABI. To migrate, fix the filter keys, values and event names the compiler reports, and narrow on `log.eventName` instead of casting `log.args`. To keep untyped results, type the ABI as `Abi`. `Log`, `GetLogsParameters`, `GetLogsReturnType`, `GetEventsOptions`, `DecodeEventLogParameters` and `DecodeEventLogReturnType` gain optional type parameters.
- The contract helper types now use the same TRON type mapping as the actions. This covers `ContractFunctionArgs`, `ContractFunctionReturnType`, `ContractErrorArgs`, `ContractEventArgs`, `ContractEventArgsFromTopics`, `AbiItemArgs`, `ExtractAbiFunctionForArgs` and `ExtractAbiItemForArgs`. With this mapping, `address` inputs are `AddressInput`, `address` outputs are Base58Check `Address`, and integer inputs accept `bigint | number`. Replace `` `0x${string}` `` address annotations with `Address` or `AddressInput`, and convert with `toEvm(address)` where you need an EVM hex address.
- Removed the type helpers `GetEventArgs`, `MaybeExtractEventArgsFromAbi`, `MaybeAbiEventName`, `AbiEventParametersToPrimitiveTypes`, `AbiEventParameterToPrimitiveType`, `AbiEventTopicToPrimitiveType`, `LogTopicType`, `EventDefinition`, `ContractFunctionParameters`, `Widen` and `UnionWiden`. Replacements:
  - `GetEventArgs<abi, eventName>` → `ContractEventArgs<abi, eventName>` for filter args, or `ContractEventArgsFromTopics<abi, eventName>` for decoded args
  - `ContractFunctionParameters` → `ReadContractParameters` / `WriteContractParameters`

  The other helpers have no replacement.
- Removed the `ExtendChain` type from `@tronweb3/tviem` and `@tronweb3/tviem/chains`. Change `ExtendChain<chain, extended>` to `Assign<chain, extended>`, importing `Assign` from `@tronweb3/tviem`.

#### Clients and transport

- Removed the `cacheTime` option from `createClient`, `createPublicClient` and `createWalletClient`, and the `client.cacheTime` property. Delete the option. No action read it, so behavior does not change.
- Removed the `normalizeTronError` export from `@tronweb3/tviem`. The `http` transport applies it to every node response unless `raw: true` is set, so you can delete direct calls.

#### Exports

- From `@tronweb3/tviem`, `signMessage`, `signTransaction` and `signTypedData` are now the client actions, called as `signMessage(client, { message, account })`. They are the same bindings as in `@tronweb3/tviem/actions`. The `@tronweb3/tviem` types `SignMessageParameters`, `SignMessageErrorType`, `SignTypedDataParameters`, `SignTypedDataErrorType` and `SignTransactionErrorType` now describe the actions. The private-key utilities with these names and their types are exported from `@tronweb3/tviem/accounts` only. `@tronweb3/tviem/utils` no longer exports `signMessage` or `signTypedData`. Change the import of `signMessage({ message, privateKey })`:
  ```ts
  import { signMessage, signTypedData, signTransaction } from '@tronweb3/tviem'        // before (signMessage and signTypedData were also in '@tronweb3/tviem/utils')
  import { signMessage, signTypedData, signTransaction } from '@tronweb3/tviem/accounts'
  ```
  `@tronweb3/tviem` now also exports `SignMessageReturnType`, `SignTransactionParameters`, `SignTransactionReturnType` and `SignTypedDataReturnType`.

### Added

- The address-only `JsonRpcAccount` type, exported from `@tronweb3/tviem` and `@tronweb3/tviem/accounts`. It can be the owner for `build*` actions (such as `buildSendTrx`) and the caller for read actions. Actions that sign (`signMessage`, `signTypedData`, `signTransaction`, `multiSign` and every write action) accept only accounts with `type: 'local'`. For any other account they throw the new `AccountTypeNotSupportedError` before sending a request.
- `UserRejectedRequestError` (`code` `4001`), for wallet adapters and custom sources to throw when a user declines a signing request. Pass the wallet's original error as `cause`.
- `parseSignature`, exported from `@tronweb3/tviem` and `@tronweb3/tviem/utils`. It splits a 65-byte signature into `{ r, s, v, yParity }` and accepts `0x`-prefixed or bare hex with a recovery byte of `0`, `1`, `27` or `28`. Other input throws `InvalidSignatureError`.
- `parseEventLogs`, exported from `@tronweb3/tviem` and `@tronweb3/tviem/utils`. It decodes logs from `getLogs` or `TransactionInfo.logs` against an ABI and adds `eventName` and `args` to each log. It takes an optional `eventName` filter and `strict`, which defaults to `true`. The types `DecodedEvent`, `DecodedEventArgs`, `EventFilterArgs` and `ParsedEvent` are exported from `@tronweb3/tviem` and `@tronweb3/tviem/actions`.
- New `TransactionInfo` fields: `result`, `resMessage`, `revertReason`, `internalTransactions`, `packingFee`, `energyPenaltyTotal` and `originEnergyUsage`. The new types `TransactionResult` and `InternalTransaction` are exported. `TransactionRevertedError` now exposes `reason` and `result` and includes both in its message.
- New error classes, all extending `BaseError` and each with a matching `…ErrorType`:
  - `InvalidParameterError` (`param`, and `reason` typed `InvalidParameterReason`)
  - `MissingFieldError` (`field`)
  - `TypedDataError` (`path`)
  - `TransactionIntegrityError` (`field`)
  - `PermissionError` (`permissionId`)
  - `InvalidSignatureError`
  - `InvalidBlockHeaderError`
  - `NodeResponseMalformedError`
  - `InvalidPrivateKeyError`
  - `InvalidHashError`
  - `InvalidDecimalsError`
- New options on the `InvalidAddressError` constructor: `hideValue` leaves the value out of the message, and `metaMessages` replaces the default guidance.
- New type exports: `ContractMessageByType` (the decoded message for each contract type name), `ContractMessageInput`, and the decoded `ExchangeCreateContract`, `ExchangeInjectContract`, `ExchangeWithdrawContract`, `ExchangeTransactionContract` and `UnfreezeAssetContract` models, together with their `…Input` forms.
- An optional `args` type parameter on `WriteContractParameters`, `BuildWriteContractParameters` and `EstimateEnergyParameters`. `writeContract`, `buildWriteContract`, `estimateEnergy` and the matching client methods infer it from the `args` you pass, so with an overloaded function the overload that `args` selects sets the call value options.
- Basic-auth support in the `http` transport: credentials in a node URL (`https://user:password@host`) are sent as that node's `Authorization` header, and the request goes to the URL without them. An `Authorization` header in `fetchOptions.headers` takes precedence.

### Changed

- `signTransaction`, `multiSign` and every write action that signs and broadcasts (`sendTrx`, `writeContract`, `deployContract`, …) now check the transaction the account returns. It must pass `txCheck`, carry at least one signature and keep each contract's `owner_address`, otherwise the action throws `TransactionMismatchError`. The account may rebuild the transaction, for example with a new `txID`, and the action continues with the transaction it returns.
- `createClient` and `createPublicClient` no longer import secp256k1 or the key-backed account modules, so read-only bundles do not include them.
- `privateKeyToAccount`, `privateKeyToAddress` and the private-key utilities in `@tronweb3/tviem/accounts` (`signMessage`, `signTypedData`, `signTransaction`, `multiSignTransaction`) accept a key with a `0x` or `0X` prefix and surrounding whitespace. Any other form, or a key out of range, throws `InvalidPrivateKeyError`.
- `mnemonicToAccount` normalizes the phrase before validating it. It trims the phrase, lower-cases it and collapses runs of whitespace into single spaces, as TronWeb and ethers do. A phrase already in that form derives the same account as before.
- `serializeSignature` takes the recovery id as `v` (`27` or `28`, as a number or bigint) or, when `v` is absent, as `yParity` (`0` or `1`). The new `SerializeSignatureParameters` type describes this input. `verifyMessage`, `verifyTypedData`, `recoverMessageAddress`, `recoverTypedDataAddress` and `recoverPublicKey` accept signature objects in the same form.

### Fixed

- `hashMessage` throws `InvalidParameterError` when a `raw` message is neither a `0x`-prefixed hex string nor bytes. `signMessage`, `verifyMessage` and `recoverMessageAddress` behave the same way.
- `getBlock` throws `InvalidParameterError` when `blockNumber` is `null`, before sending a request.
- `broadcastTransaction` and `broadcastHex` throw `TronBroadcastError`, with `code` and `txid`, when the node rejects a broadcast with a non-success `code` and no `result` field.
- `decodeEventLog` tries, in ABI order, every event that shares the log's selector (such as TRC-20 and TRC-721 `Transfer`) and returns the first exact decode. If none decodes exactly, the first matching event decides the result: its mismatch error is thrown, or with `strict: false` its partial decode is returned.
- When a value cannot be converted to a string (for example an object with a `null` prototype), `encodeAbiParameters` and `encodePacked` throw `InvalidAbiParameterValueError`, and its message names the value's type.
- `getContract` with an ABI typed as `Abi` provides callable `write.<fn>` and `estimateEnergy.<fn>` methods that accept the call value options.
- A tuple argument with unnamed components now accepts a `readonly` tuple, so `as const` arguments type-check in `writeContract`, `estimateEnergy`, `readContract` and the `getContract` methods.

## [1.0.0-beta.1]

Initial public beta release of `@tronweb3/tviem`, a lightweight, type-safe TypeScript SDK for the TRON blockchain with a viem-style API.

- **Clients and transports**: `createPublicClient`, `createWalletClient` and `createClient`, which composes action sets with `.extend(publicActions)` / `.extend(walletActions)`. A Wallet Client accepts an account or a private key as its `account`. The `http` transport sends requests to the FullNode, SolidityNode and event endpoints (`solidityUrl`, `eventUrl`). It sends `apiKey` as the `TRON-PRO-API-KEY` header and supports `timeout`, `retryCount` and `retryDelay`. `createTransport` builds custom transports.
- **Public actions**: `getBalance`, `getAccount`, `getAccountResources`, `getChainParameters`, `getBlock`, `getNowBlock`, `getTransaction`, `getTransactionInfo`, `getLogs` (decoded event logs from the node's `eth_getLogs` endpoint), `getSignWeight` and `getApprovedList` for multi-signature transactions, and `waitForTransactionReceipt`. By default, `waitForTransactionReceipt` waits for a solidified receipt; with `confirmed: false` it reads from the FullNode. Reads such as `getBalance` and `getBlock` accept `confirmed: true` to read solidified state.
- **Wallet actions and transaction builders**: builders for the TRON system contracts. They cover TRX and TRC-10 transfers, staking and resource delegation, voting and reward withdrawal, witness and account management, TRC-10 token issuance, proposals, exchanges, account permissions, contract settings, and contract calls and deployment.
  - Each type has a send action that builds, signs locally and broadcasts (e.g. `sendTrx`, `freezeBalanceV2`, `delegateResource`, `voteWitness`, `accountPermissionUpdate`).
  - Each type also has a `build*` counterpart (e.g. `buildSendTrx`) that returns an unsigned `{ txID, raw_data, raw_data_hex }` transaction.
  - All of them accept `memo`, `expirationMs` and a `blockHeader` for fully offline builds. `build*` actions also accept `permissionId`.
  - Signing and broadcasting actions: `signTransaction`, `signMessage`, `signTypedData`, `multiSign`, `broadcastTransaction` and `broadcastHex`.
- **Smart contracts**:
  - `readContract` calls `view`/`pure` functions. It needs a caller `account`, passed per call or set on the Client.
  - `triggerConstantContract` simulates any function and returns its `result` and `energyUsed`. `estimateEnergy` estimates the energy a call needs.
  - `writeContract` / `buildWriteContract` support `callValue`, `callTokenValue` and `tokenId`. `feeLimit` defaults to 150 TRX.
  - `deployContract` / `buildDeployContract` deploy contracts, and `deployContract` returns the derived `contractAddress`.
  - `getContract` binds an ABI and an address into `read`, `write`, `estimateEnergy` and `getEvents` namespaces.
  - Reverts are thrown as `ContractFunctionRevertedError`, with the decoded `Error(string)` reason or `Panic(uint256)` code.
- **Accounts**: `privateKeyToAccount`, `mnemonicToAccount`, `hdKeyToAccount` (TRON BIP-44 path, default `m/44'/195'/0'/0/0`), `toAccount` for custom signers, `generatePrivateKey` and `generateMnemonic`. Local accounts sign transactions, TIP-191 messages and TIP-712 typed data, and co-sign multi-signature transactions with `multiSign`. Before signing, `signTransaction` checks two things: `txID`, `raw_data` and `raw_data_hex` must match, and the transaction's owner must be the signing account.
- **ABI, address, unit and encoding utilities**:
  - ABI encoding and decoding for function data, results, events, errors and deploy data (`encodeFunctionData`, `decodeFunctionResult`, `decodeEventLog`, `encodePacked`, `getAbiItem`, …). `trcToken` is handled like `uint256`, and decoded addresses use the Base58Check form.
  - Address helpers (`isAddress`, `isAddressEqual`, `normalizeAddress`, `toBase58`, `toEvm`, `addressToHex`, `getCreate2Address`) accept Base58Check `T…`, TRON hex `41…` and EVM hex `0x…`.
  - Unit helpers: `parseTrx` / `formatTrx` convert between TRX and SUN, and `parseUnits` / `formatUnits` take any number of decimals.
  - Hex and bytes encoding, data helpers and hashing (`toHex`, `fromHex`, `toBytes`, `concat`, `slice`, `pad`, `keccak256`, `sha256`, `toFunctionSelector`).
- **Signature and transaction utilities**:
  - Message and typed-data signatures: `hashMessage` (TIP-191), `hashTypedData` (TIP-712), `verifyMessage`, `verifyTypedData`, `recoverMessageAddress` and `recoverTypedDataAddress`.
  - Protobuf serialization and decoding of transactions (`serializeTransaction`, `toBroadcastHex`, `decodeRawData`), plus `getTransactionId`, `txCheck` and `genContractAddress`.
- **Chains**: `mainnet`, `nile` and `shasta` definitions, each with TronGrid FullNode, SolidityNode and event endpoints, and `defineChain` for custom networks.
- **Packaging**: ESM and CommonJS builds with type declarations and `sideEffects: false`.
  - Entry points: `@tronweb3/tviem`, `@tronweb3/tviem/accounts`, `@tronweb3/tviem/actions`, `@tronweb3/tviem/chains` and `@tronweb3/tviem/utils`.
  - Requires Node.js 22+. TypeScript 5.4+ is an optional peer dependency.
  - Runtime dependencies: `@noble/curves`, `@noble/hashes`, `@scure/base`, `@scure/bip32`, `@scure/bip39` and `abitype`.

[1.0.0-rc.1]: https://github.com/tronweb3/tviem/compare/v1.0.0-beta.1...v1.0.0-rc.1
[1.0.0-beta.1]: https://github.com/tronweb3/tviem/releases/tag/v1.0.0-beta.1
