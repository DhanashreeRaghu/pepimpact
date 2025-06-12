# Deploying to Amazon EKS

This guide explains how to deploy the Planner Agent Web UI to an Amazon EKS cluster.

## Prerequisites

1. AWS CLI installed and configured
2. kubectl installed and configured to work with your EKS cluster
3. Docker installed
4. An existing EKS cluster
5. AWS Load Balancer Controller installed on your EKS cluster

## Deployment Steps

### 1. Update Configuration

Edit the following files to match your environment:

- `kubernetes/configmap.yaml`: Update environment variables
- `kubernetes/secret.yaml`: Update with your actual secrets (base64 encoded)
- `kubernetes/ingress.yaml`: Update with your domain name if needed

### 2. Deploy to EKS

Run the deployment script:

```bash
# Make the script executable
chmod +x deploy-to-eks.sh

# Run the deployment
./deploy-to-eks.sh
```

This script will:
- Build the Docker image
- Push it to Amazon ECR
- Deploy the application to your EKS cluster

### 3. Verify Deployment

Check if the pods are running:

```bash
kubectl get pods
```

Check the service:

```bash
kubectl get svc planner-agent-webui
```

Check the ingress:

```bash
kubectl get ingress planner-agent-webui
```

## Accessing the Application

Once deployed, the application will be available at the ALB DNS name provided by the ingress controller.

To get the ALB DNS name:

```bash
kubectl get ingress planner-agent-webui -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'
```

## Scaling

To scale the application, update the number of replicas:

```bash
kubectl scale deployment planner-agent-webui --replicas=3
```

## Troubleshooting

### Check Pod Logs

```bash
kubectl logs -l app=planner-agent-webui
```

### Check Pod Status

```bash
kubectl describe pod -l app=planner-agent-webui
```

### Check Ingress Status

```bash
kubectl describe ingress planner-agent-webui
```