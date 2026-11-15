FROM amazonlinux:2023
ARG CACHEBUST=2026-11-15-19-29-42

COPY plbase-install.sh python-requirements.txt /

RUN /bin/bash /plbase-install.sh

CMD [ "/bin/bash" ]
