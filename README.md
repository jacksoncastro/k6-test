# K6 TEST GENERATOR

## BUILD

```bash
docker build -t jackvasc/k6-test .
```

## PUBLISH

```bash
docker push jackvasc/k6-test
```

## EXECUTE

```bash
docker \
    run -it --rm \
    -e ACCESS_KEY='<ACESS_KEY>' \
    -e SECRET_KEY='<SECRET_KEY>' \
    -v "/path/to/script.js:/k6-script.js" \
    -v "/path/to/queries.json:/queries.json" \
    jackvasc/k6-test
```
