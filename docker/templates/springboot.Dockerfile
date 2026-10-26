# Spring Boot — Multi-stage Maven/Gradle build
# Supports both Maven (pom.xml) and Gradle (build.gradle) projects

FROM eclipse-temurin:21-jdk AS build
WORKDIR /app

# Maven build
COPY pom.xml* ./
COPY mvnw* ./
COPY .mvn .mvn 2>/dev/null || true
RUN if [ -f pom.xml ]; then \
      if [ -f mvnw ]; then chmod +x mvnw && ./mvnw dependency:go-offline; \
      else apt-get update && apt-get install -y maven && mvn dependency:go-offline; fi; \
    fi

# Gradle build
COPY build.gradle* settings.gradle* ./
COPY gradlew* ./
COPY gradle gradle 2>/dev/null || true
RUN if [ -f build.gradle ] || [ -f build.gradle.kts ]; then \
      if [ -f gradlew ]; then chmod +x gradlew && ./gradlew dependencies --no-daemon; \
      else apt-get update && apt-get install -y gradle && gradle dependencies; fi; \
    fi

COPY src ./src
RUN if [ -f pom.xml ]; then \
      if [ -f mvnw ]; then ./mvnw package -DskipTests; \
      else mvn package -DskipTests; fi; \
    elif [ -f build.gradle ] || [ -f build.gradle.kts ]; then \
      if [ -f gradlew ]; then ./gradlew bootJar --no-daemon; \
      else gradle bootJar; fi; \
    fi

FROM eclipse-temurin:21-jre-alpine AS runtime
WORKDIR /app

# Copy the built JAR (works for both Maven and Gradle output locations)
COPY --from=build /app/target/*.jar app.jar 2>/dev/null || true
COPY --from=build /app/build/libs/*.jar app.jar 2>/dev/null || true

EXPOSE 8080
CMD ["java", "-jar", "app.jar"]
