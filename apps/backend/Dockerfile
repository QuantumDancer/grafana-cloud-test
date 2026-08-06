# Stage 1: build the application jar with Maven (via the wrapper, so the build uses the exact
# Maven version the project was developed against rather than whatever happens to be on the
# builder image).
FROM docker.io/library/eclipse-temurin:25-jdk AS build
WORKDIR /workspace

# Copy just the wrapper + POM first so Docker's layer cache can skip re-downloading the entire
# dependency tree whenever only application source changes.
COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN ./mvnw -q -B dependency:go-offline

COPY src/ src/
# Tests need a real Postgres (Testcontainers) which isn't available during a plain `docker
# build`; they're already run separately in CI (`./mvnw verify`), so skip them here rather than
# require Docker-in-Docker just to produce the runtime jar.
RUN ./mvnw -q -B package -DskipTests

# Stage 2: runtime image. Deliberately uninstrumented application code — all telemetry comes
# from attaching Grafana's OpenTelemetry Java distribution as a javaagent, not from any
# OTel dependency in the app's own classpath (see pom.xml).
FROM docker.io/library/eclipse-temurin:25-jre AS runtime
WORKDIR /app

# Pinned to the version researched/recorded in README.md; bump both together.
ARG GRAFANA_OTEL_JAVA_VERSION=2.30.0
ADD https://github.com/grafana/grafana-opentelemetry-java/releases/download/v${GRAFANA_OTEL_JAVA_VERSION}/grafana-opentelemetry-java.jar /otel/grafana-opentelemetry-java.jar

COPY --from=build /workspace/target/backend-*.jar /app/app.jar

# Everything below is overridable at `docker run` / Kubernetes time; these are just sane
# in-cluster-adjacent defaults so the image is useful standalone too (e.g. pointed at a local
# Alloy or directly at Grafana Cloud's OTLP endpoint via env override).
ENV JAVA_TOOL_OPTIONS="-javaagent:/otel/grafana-opentelemetry-java.jar"
ENV OTEL_SERVICE_NAME="spyglass-backend"
ENV OTEL_RESOURCE_ATTRIBUTES="service.namespace=shop,deployment.environment=test"
ENV OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318"
ENV OTEL_EXPORTER_OTLP_PROTOCOL="http/protobuf"

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
