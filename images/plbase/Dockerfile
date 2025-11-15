FROM amazonlinux:2023
ARG CACHEBUST=2025-11-15-14-10-34

COPY plbase-install.sh python-requirements.txt /

RUN /bin/bash /plbase-install.sh

CMD [ "/bin/bash" ]
