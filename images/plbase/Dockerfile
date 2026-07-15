FROM amazonlinux:2023
ARG CACHEBUST=2026-07-15-15-18-37

COPY plbase-install.sh python-requirements.txt /

RUN /bin/bash /plbase-install.sh

CMD [ "/bin/bash" ]
