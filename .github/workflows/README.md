## Vercel Deployments

### Feature PR to main [preview-pr.yml](./preview-pr.yml)
- Runs checks: lint, test (for all), e2e:test (for vercel access prs)
- Creates a preview URL to test feature using the DEV environment (for vercel access prs)
- Generate Lighthouse report based on preview URL (for vercel access prs)

### When feature is merged to main 
- Vercel automatically deploys any new changes done in main to the staging environment
- No github workflow

### Production Release [vercel-prod-on-release.yml](./vercel-prod-on-release.yml)
- Done automatically on Github releases 
- Can be manually triggered
