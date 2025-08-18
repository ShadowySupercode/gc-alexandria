# Auth

The Auth module is one of the most critical of the Nostr utilities. It needs to support the different login patterns typical of the Nostr ecosystem, particularly browser extension login and remote signer login.

## Background

First, some terminology. "Auth" can quickly become an overloaded term, as there are actually two areas of concern contained under that umbrella: _authentication_ and _authorization_. These are sometimes abbreviated "authn" and "authz", respectively, and these abbreviations will be used throughout this document. Collectively, the general domain of authn and authz may be referred to simply as "auth".

### Authentication

Nostr applications invert the typical authn flow of most web applications. Rather than users proving their identity to a cental authority server, Nostr users prove their identity to other users via cryptographically verifiable signatures. An application knows a user is who they say they are when that user signs a bit of data with their private key and the signature matches their public key.

A Nostr application should verify every signed event it encounters, and should hide or otherwise suppress events with unverified signatures.

### Authorization

Authorization, likewise, is inverted in Nostr apps. The user authorizes an application to perform actions _on their behalf_ by approving requests from the application to sign pieces of data. For best security, an application never performs event signature actions itself on behalf of the user. Rather, it sends the event to either a browser extension (if running in the browser) or to a separate signer application, which then returns the event with an attached signature generated with the user's private key. Thus, the user's private key is never exposed to the application code.

The other component of authz deals with the user's access to Nostr relays. Relays may block or allow certain actions for certain npubs. Before a user can, for example, publish an event to a relay, it must be authorized by that relay to do so.

## Workflows

The Auth module within Alexandria provides support for the authn and authz workflows described below.

### Event Authentication

When the application encounters a Nostr event, it must:

- Verify the event's signature.
  - If the event has an invalid signature, the event must be hidden, its data deleted, and an appropriate warning message shown to the user.
- Verify the user that signed the event.
  - Check whether the user has NIP-05 verification, and display the verification status.
  - Check whether the user is on any relevant block lists, and hide the event if so.

### User Sign-in

#### With a NIP-07 Browser Extension

When the user wishes to sign in with a NIP-07 browser extension, the application must:

- Call the `window.nostr` interface to obtain basic data on the user, including npub.
- Read the user's preferred relay list, if available, and send it to the relay management module.
- Fetch the user's profile from a relay to supplement the user data obtained from the NIP-07 extension.
- Update the UI to indicate the user is signed in.
- Update local storage to indicate whether the user should stay signed in across sessions.

#### With a Remote Signer

When the user wishes to sign in with a remote signer app, such as Amber, the application must:

- Request the user for connection data to find the remote signer.
  - The application may display a QR code the signer app can scan to initiate a handshake.
  - The application may accept a user-provided connection string and initiate the handshake itself.
- Complete the signer handshake.
  - This may take a few seconds.
  - The application should present instructions to the user to complete the handshake on the remote signer app.
- Fetch the user's profile from a relay to obtain necessary profile information.
- Update the UI to indicate the user is signed in.
- Update local storage to indicate whether the user should stay signed in across sessions.

### Automatic Sign-in on session Restore

If a user has signed in and wishes to remain signed in, a flag indicating this preference must be written to local storage. When the user starts a new session, if the flag is set, the application must attempt restore the signed-in state.

#### With a NIP-07 Browser Extension

Session restore with a NIP-07 browser extension follows essentially the same pattern as initial sign in with an extension.

#### With a Remote Signer

If the user signs in with a remote signer app, the application should add the connection details used during the handshake to local storage. Thus, when a new session begins:

- Retrieve the connection details from local storage.
- Use the connection details to initiate a connection handshake to a remote signer.
- Attempt to complete the handshake.
- Indicate to the user if the handshake fails after a specified timeout.

This session restoration task may be delegated to a background web worker to help provide a smooth user experience. If the user attempts to perform an event signature action before session restoration is complete, the application may either:

- Indicate to the user that the session restoration is still in progress.
- Add the event to a queue, and attempt to sign it when the session restoration has completed.
