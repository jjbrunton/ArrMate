# Deployment

## Docker Image Publishing

ArrMate publishes a multi-architecture container image to GitHub Container Registry (GHCR) via [`.github/workflows/docker-publish.yml`](../.github/workflows/docker-publish.yml).

### Workflow Behavior

- Pull requests targeting `main` or `master` run the test suite and verify the Docker build, but do not push an image
- Pushes to `main` or `master` run `npm test`, build a `linux/amd64` + `linux/arm64` image, and publish it to `ghcr.io/<owner>/<repo>`
- Tags matching `v*` publish versioned image tags alongside the commit SHA tag
- The default branch also publishes `:latest`

### Registry Authentication

- The workflow uses the repository `GITHUB_TOKEN`, so the repository must allow GitHub Actions to write packages
- If the GHCR package is private, Docker hosts need a token with `read:packages` to pull it
- If the GHCR package is public, Docker hosts can pull it anonymously

## Running on a Docker Host

Replace `<owner>` and `<repo>` with the GitHub repository path.

### Pull and Run

```bash
docker pull ghcr.io/<owner>/<repo>:latest

docker run -d \
  --name arrmate \
  --restart unless-stopped \
  -p 3000:3000 \
  -e DB_PATH=/app/data/arrmate.db \
  -v arrmate-data:/app/data \
  ghcr.io/<owner>/<repo>:latest
```

### Docker Compose

```yaml
services:
  arrmate:
    image: ghcr.io/<owner>/<repo>:latest
    ports:
      - "3000:3000"
    environment:
      DB_PATH: /app/data/arrmate.db
    volumes:
      - arrmate-data:/app/data
    restart: unless-stopped

volumes:
  arrmate-data:
```

### Private GHCR Packages

Log in on the Docker host before pulling:

```bash
echo "<github-token>" | docker login ghcr.io -u "<github-username>" --password-stdin
```
