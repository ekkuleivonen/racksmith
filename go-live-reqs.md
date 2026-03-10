# Beta launch ready?

## Limit filetree and git diff

User does not need to see other files in their codebase via racksmith.

- Limit codetree to only show the .racksmith folder (wherever it is)
- Limit git diff to show only hits from the .racksmith folder (wherever it is)
- Limit the diff indicator count to show only hits from .racksmith folder (wherever it is)

## Responsibilities and the true use case

### Users will deploy the 'client'

Users will be 99% deploying the backend, redis, worker, and frontend as their racksmith client within their local lan, so racksmith can have safe access to their host machines for control. Registry is something i manage in the cloud, and its available for everyone.

### User should not worry about setting up GH auth

I'm afraid we need to move GH auth from racksmith backend to registry. Users dont need to deploy their own GH oauth apps this way. Racksmith will call registry to complete the auth and keep the token for itself. It will need to periodically refresh the token from registry.

### User should not worry about infra like serparate redis, worker, backend, and frontend services

We'll need to bundle all 4 services into a single docker container so that users can simply spin it up and it works magically.
