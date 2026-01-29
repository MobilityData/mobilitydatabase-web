## Vercel Deployments

### Feature PR to main [vercel-preview-pr.yml](./vercel-preview-pr.yml)
- Runs checks: lint, test, e2e:test
- Creates a preview URL to test feature using the DEV environment
- Generate Lighthouse report based on preview URL

### When feature is merged to main 
- Vercel automatically deploys any new changes done in main to the staging environment
- No github workflow

### Production Release [vercel-prod-on-release.yml](./vercel-prod-on-release.yml)
- Done automatically on Github releases 
- Can be manually triggered
